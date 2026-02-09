import { sendEmail, emailTemplates } from "@/lib/email-service";
import { NextResponse } from "next/server";
import { db as prisma } from "@/lib/db"; // Assuming this is where the prisma client is exported
import { hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";
import { gradeHomework } from "@/lib/ai-grader";

export async function POST(req: Request) {
  try {
    const { blockId, data, answers } = await req.json();
    
    // Mapping: keys from LandingForm are labels ("Email", "Имя", "Телефон")
    const emailKey = Object.keys(data).find(k => k.toLowerCase() === "email");
    const nameKey = Object.keys(data).find(k => k.toLowerCase() === "имя" || k.toLowerCase() === "name");

    const email = (emailKey ? data[emailKey] : data.email)?.toLowerCase().trim();
    const fullName = nameKey ? data[nameKey] : data.name;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // 1. Find or Create User
    let user = await prisma.user.findUnique({ where: { email } });
    let isNewUser = false;
    let generatedPassword = "";

    if (!user) {
      generatedPassword = uuidv4().slice(0, 8); // Random 8-char password
      const passwordHash = await hash(generatedPassword, 10);
      
      user = await prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: "student",
          tariff: "SR"
        }
      });
      isNewUser = true;
    }

    // 2. Schedule Auto-Review (Legacy Random Delay)
    const delayMinutes = Math.floor(Math.random() * (90 - 60 + 1) + 60);
    const autoResponseScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // 3. Pick random response template
    const block = await prisma.landingBlock.findUnique({ where: { id: blockId } });
    const templates = block?.responseTemplates || [];
    const validTemplates = templates.filter(t => t && t.trim() !== "");
    
    let responseTemplateIndex = null;
    if (validTemplates.length > 0) {
       const validIndices = templates
          .map((t, i) => (t && t.trim() !== "") ? i : -1)
          .filter(i => i !== -1);
       
       if (validIndices.length > 0) {
          const rand = Math.floor(Math.random() * validIndices.length);
          responseTemplateIndex = validIndices[rand];
       }
    }

    // 4. Create Submission
    const submission = await prisma.homeworkSubmission.create({
      data: {
        userId: user.id,
        landingBlockId: blockId,
        // Store both form data and text answers
        content: JSON.stringify({ ...data, _answers: answers }),
        status: "pending",
        autoResponseScheduledAt,
        responseTemplateIndex
      }
    });

    // 5. Set Cookie for Session Persistence
    const cookieStore = await cookies();
    cookieStore.set("landing_session_user", user.id, { 
       httpOnly: true, 
       path: "/", 
       maxAge: 60 * 60 * 24 * 30 // 30 days 
    });

    // 6. Integrate with LMS, AI, and Bitrix24 (Async background task)
    (async () => {
       const fs = require('fs');
       const logFile = '/tmp/debug_route.log';
       const log = (msg: string) => {
          const entry = `[${new Date().toISOString()}] ${msg}\n`;
          fs.appendFileSync(logFile, entry);
          console.log(msg);
       };

       try {
          log(`Async task started for user ${user.id}`);

          // Log submission start
          await prisma.auditLog.create({
             data: {
                userId: user.id,
                action: "LANDING_SUBMISSION",
                entity: "HomeworkSubmission",
                entityId: submission.id,
                details: { step: "started", email, blockId }
             }
          });
          log('Audit log created: LANDING_SUBMISSION');

          // --- SEND WELCOME EMAIL ---
          if (isNewUser) {
             try {
                 log(`Sending welcome email to ${email}`);
                 await sendEmail({
                   to: email,
                   subject: "Добро пожаловать в PRORYV!",
                   html: emailTemplates.welcome(email, generatedPassword)
                 });
                 log('Welcome email sent');
                 
                 await prisma.auditLog.create({
                    data: {
                       userId: user.id,
                       action: "EMAIL_SENT",
                       entity: "User",
                       entityId: user.id,
                       details: { type: "welcome", email }
                    }
                 });
             } catch (e: any) {
                 log(`[ERROR] Failed to send welcome email: ${e.message}`);
                 // Continue execution even if email fails
             }
          } else {
             log('User exists, skipping welcome email');
          }

          // --- LMS LOGIC ---
          log(`Fetching landing block ${blockId}`);
          const landingBlock = await prisma.landingBlock.findUnique({
             where: { id: blockId },
             include: { page: true }
          });
          log(`Landing block fetch result: ${landingBlock ? 'Found' : 'Null'}`);

          let lessonId = landingBlock?.lessonId;
          const submissionId = submission.id;

          if (lessonId) {
             log(`Block linked to lesson ${lessonId}, processing LMS logic...`);
             const lesson = await prisma.lesson.findUnique({
                where: { id: lessonId },
                include: { module: true }
             });
             log(`Lesson fetch result: ${lesson ? 'Found' : 'Null'}`);

             if (lesson) {
                const courseId = lesson.module.courseId;
                log(`Course ID: ${courseId}`);
                
                // Enroll user if not enrolled
                const existingEnrollment = await prisma.enrollment.findUnique({
                   where: { userId_courseId: { userId: user.id, courseId } }
                });

                if (!existingEnrollment) {
                   log(`Enrolling user to course ${courseId}`);
                   await prisma.enrollment.create({
                      data: {
                         userId: user.id,
                         courseId,
                         status: "active",
                         startDate: new Date()
                      }
                   });
                   
                   await prisma.auditLog.create({
                      data: {
                         userId: user.id,
                         action: "COURSE_ENROLLMENT",
                         entity: "Course",
                         entityId: courseId,
                         details: { reason: "landing_submission" }
                      }
                   });
                   log('Enrollment created');
                } else {
                   log('User already enrolled');
                }
                
                // Link submission to lesson
                await prisma.homeworkSubmission.update({
                   where: { id: submissionId },
                   data: { lessonId: lesson.id }
                });
                log(`Linked submission ${submissionId} to lesson ${lesson.id}`);

                // --- AI AUTO-GRADING ---
                if (lesson.aiPrompt) {
                   log(`Lesson has AI prompt. Starting auto-grading for submission ${submissionId}...`);
                   const aiResult = await gradeHomework(
                      // Combine form data and answers for full context
                      JSON.stringify({ form: data, answers: answers }), 
                      lesson.aiPrompt
                   );
                   
                   log(`AI Result: ${JSON.stringify(aiResult)}`);
                   
                   await prisma.homeworkSubmission.update({
                      where: { id: submissionId },
                      data: {
                         status: aiResult.status,
                         curatorComment: aiResult.comment,
                         reviewedAt: new Date(),
                         curatorId: null // System
                      }
                   });
                   log('Submission updated with AI result');
                   
                   await prisma.auditLog.create({
                      data: {
                         userId: user.id,
                         action: "AI_GRADING",
                         entity: "HomeworkSubmission",
                         entityId: submissionId,
                         details: { status: aiResult.status, comment_length: aiResult.comment?.length }
                      }
                   });
                   log('Audit log created: AI_GRADING');

                   // Send Grading Notification
                   try {
                       log(`Sending homework graded email to ${email}`);
                       await sendEmail({
                         to: email,
                         subject: `Результат проверки ДЗ: ${lesson.title}`,
                         html: emailTemplates.homeworkGraded(lesson.title, aiResult.status, aiResult.comment)
                       });
                       log('Graded email sent');
                       
                       await prisma.auditLog.create({
                          data: {
                             userId: user.id,
                             action: "EMAIL_SENT",
                             entity: "HomeworkSubmission",
                             entityId: submissionId,
                             details: { type: "graded", email, status: aiResult.status }
                          }
                       });
                   } catch (e: any) {
                       log(`[ERROR] Failed to send graded email: ${e.message}`);
                   }
                } else {
                   log('No AI Prompt for lesson');
                }
             }
          } else {
             log('No lessonId for block');
          }

          // --- BITRIX LOGIC ---
          const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
          
          if (bitrixUrl) {
             const fs = require('fs');
             const logPath = '/tmp/bitrix_debug.log';
             const debugLog = (msg: string) => {
                 try {
                     fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
                     console.log(`[BITRIX] ${msg}`);
                 } catch (e) { console.error("Log failed", e); }
             };

             debugLog("Starting Bitrix integration...");
             const funnelId = process.env.BITRIX_FUNNEL_ID || "14";
             const stageId = process.env.BITRIX_SOURCE_STAGE_ID || "C14:PREPAYMENT_INVOIC";
             
             // Fetch all blocks to resolve question texts
             const allBlocks = await prisma.landingBlock.findMany({
                where: { pageId: landingBlock?.pageId },
                orderBy: { orderIndex: 'asc' }
             });

             let qaString = "";
             Object.entries(answers || {}).forEach(([blkId, answer]) => {
                 const questionBlock = allBlocks.find(b => b.id === blkId);
                 if (questionBlock && (questionBlock.content as any).html) {
                    const questionText = (questionBlock.content as any).html.replace(/<[^>]*>?/gm, ' ').trim();
                    qaString += `Вопрос: ${questionText}\nОтвет: ${answer}\n\n`;
                 }
             });

             const landingTitle = landingBlock?.page.title || "Unknown Landing";
             
             // 1. Find/Create Contact (Enhanced Search)
             // Try Email first
             debugLog(`Searching contact by email: ${email}`);
             let contactId = null;
             
             try {
                const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${email}&select[]=ID`);
                const searchData = await searchRes.json();
                contactId = searchData.result?.[0]?.ID;
             } catch (e) { debugLog(`Email search failed: ${e}`); }
             
             // Try Phone
             const phoneKey = Object.keys(data).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("телефон"));
             const phone = phoneKey ? data[phoneKey] : null;

             if (!contactId && phone) {
                debugLog(`Searching contact by phone: ${phone}`);
                try {
                   const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[PHONE]=${phone}&select[]=ID`);
                   const searchData = await searchRes.json();
                   contactId = searchData.result?.[0]?.ID;
                } catch (e) { debugLog(`Phone search failed: ${e}`); }
             }
             
             // Create Contact if not found
             if (!contactId) {
                debugLog("Contact not found, creating new...");
                const createContactRes = await fetch(`${bitrixUrl}crm.contact.add`, {
                   method: "POST",
                   headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({
                      fields: {
                         NAME: fullName || "Студент",
                         EMAIL: [{ VALUE: email, VALUE_TYPE: "WORK" }],
                         PHONE: phone ? [{ VALUE: phone, VALUE_TYPE: "WORK" }] : [],
                         SOURCE_ID: "WEB",
                         OPENED: "Y"
                      }
                   })
                });
                const createData = await createContactRes.json();
                contactId = createData.result;
                debugLog(`Created contact ID: ${contactId}`);
             } else {
                debugLog(`Found contact ID: ${contactId}`);
             }
             
             if (contactId) {
                // Fetch Stage Order for Funnel (to use Right-Hand Logic)
                let stageSortMap: Record<string, number> = {};
                try {
                    const stagesRes = await fetch(`${bitrixUrl}crm.dealcategory.stage.list?id=${funnelId}`);
                    const stagesData = await stagesRes.json();
                    const stages = stagesData.result || [];
                    stages.forEach((s: any) => {
                        stageSortMap[s.STATUS_ID] = parseInt(s.SORT);
                    });
                } catch (e) { debugLog(`Error fetching stages: ${e}`); }

                // 2. CHECK FOR EXISTING ACTIVE DEALS (Right Hand Logic - "Keep the Right-most")
                debugLog("Searching for EXISTING open deals (with all fields)...");
                let activeDealId = null;
                let activeDeals: any[] = [];
                
                try {
                    // Fetch deals with Custom Fields (UF_*) and SELECT ALL ("*")
                    const activeDealsRes = await fetch(`${bitrixUrl}crm.deal.list?filter[CONTACT_ID]=${contactId}&filter[CLOSED]=N&select[]=ID&select[]=TITLE&select[]=STAGE_ID&select[]=CATEGORY_ID&select[]=DATE_CREATE&select[]=UF_*`);
                    const activeDealsData = await activeDealsRes.json();
                    activeDeals = activeDealsData.result || [];
                    
                    if (activeDeals.length > 0) {
                        // Select Master Deal (The one with the HIGHEST sort order in stage)
                        let masterDeal = activeDeals[0];
                        let maxSort = -1;

                        // Determine sort for first deal as baseline
                        const initSort = stageSortMap[masterDeal.STAGE_ID];
                        maxSort = initSort !== undefined ? initSort : -1;

                        for (const deal of activeDeals) {
                            const sId = deal.STAGE_ID;
                            const sort = stageSortMap[sId] !== undefined ? stageSortMap[sId] : -1;
                            
                            if (sort > maxSort) {
                                maxSort = sort;
                                masterDeal = deal;
                            } else if (sort === maxSort) {
                                // Tie-breaker: Newer ID
                                if (parseInt(deal.ID) > parseInt(masterDeal.ID)) {
                                    masterDeal = deal;
                                }
                            }
                        }
                        
                        activeDealId = masterDeal.ID;
                        debugLog(`Found ${activeDeals.length} active deals. Selected Master: #${activeDealId} (${masterDeal.TITLE}) - Stage: ${masterDeal.STAGE_ID} (Sort: ${maxSort})`);
                    }
                } catch (e) { debugLog(`Error searching active deals: ${e}`); }

                const dealTitle = `Сдал ДЗ [${landingTitle}]`;
                
                if (activeDealId) {
                    // UPDATE MASTER DEAL
                    debugLog(`Updating master deal #${activeDealId}...`);

                    // 1. Fetch FULL DATA for Master Deal
                    let masterFull: any = null;
                    try {
                        const masterRes = await fetch(`${bitrixUrl}crm.deal.get?id=${activeDealId}`);
                        const masterData = await masterRes.json();
                        masterFull = masterData.result;
                    } catch(e) { debugLog(`Error fetching full master deal: ${e}`); }

                    // 2. Prepare Fields to Update (Merged + New)
                    let mergedFields: any = {};
                    const duplicates = activeDeals.filter((d: any) => d.ID != activeDealId);
                    
                    if (duplicates.length > 0 && masterFull) {
                         // Sort duplicates by ID ASC (Oldest -> Newest)
                         duplicates.sort((a: any, b: any) => parseInt(a.ID) - parseInt(b.ID));

                         for (const dupStub of duplicates) {
                             try {
                                 // Fetch Full Duo Data
                                 const dupRes = await fetch(`${bitrixUrl}crm.deal.get?id=${dupStub.ID}`);
                                 const dupData = await dupRes.json();
                                 const dupFull = dupData.result;
                                 
                                 if (!dupFull) continue;

                                 for (const key of Object.keys(dupFull)) {
                                     // Skip system fields
                                     if (["ID", "TITLE", "DATE_CREATE", "STAGE_ID", "CATEGORY_ID", "IS_RECURRING", "IS_RETURN_CUSTOMER", "IS_REPEATED_APPROACH", "CREATED_BY_ID", "MODIFY_BY_ID", "DATE_MODIFY", "OPENED", "CLOSED", "CURRENCY_ID"].includes(key)) {
                                          continue;
                                     }

                                     const val = dupFull[key];
                                     const masterVal = masterFull[key];

                                     const isDupHasValue = val !== null && val !== "" && val !== undefined && val !== "0.00" && !(Array.isArray(val) && val.length === 0);

                                     if (isDupHasValue) {
                                          let isMasterEmpty = 
                                              masterVal === null || 
                                              masterVal === undefined || 
                                              (typeof masterVal === "string" && masterVal.trim() === "") ||
                                              (Array.isArray(masterVal) && masterVal.length === 0) ||
                                              (key === "OPPORTUNITY" && parseFloat(masterVal) === 0);

                                          // Positive Value Promotion: Overwrite "0", "No", "false"
                                          if (!isMasterEmpty && key.startsWith("UF_")) {
                                               if (masterVal === "0" || masterVal === 0 || masterVal === "No" || masterVal === false) {
                                                   if (val !== "0" && val !== 0 && val !== "No" && val !== false) {
                                                        debugLog(`Promoting field ${key}: ${masterVal} -> ${val}`);
                                                        isMasterEmpty = true; 
                                                   }
                                               }
                                          }

                                          if (isMasterEmpty) {
                                              mergedFields[key] = val;
                                              // Optimistically update local masterFull so subsequent duplicates don't overwrite if we already merged (unless we want Newest Wins, which is what happens by default iteration)
                                              masterFull[key] = val; 
                                          }
                                     }
                                 }
                             } catch(e) { debugLog(`Error merging duplicate #${dupStub.ID}: ${e}`); }
                         }
                    } else if (!masterFull) {
                        debugLog("Could not fetch Master Deal details, skipping deep merge.");
                    }

                    // Add current submission data (Highest Priority for this specific field)
                    // Always overwrite this specific integration field
                    mergedFields["UF_CRM_1770370876447"] = qaString;

                    try {
                        if (Object.keys(mergedFields).length > 0) {
                             debugLog(`Updating Master with fields: ${JSON.stringify(Object.keys(mergedFields))}`);
                             await fetch(`${bitrixUrl}crm.deal.update`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ fields: mergedFields, id: activeDealId })
                             });
                        } else {
                             debugLog(`No new fields to merge.`);
                        }
                    } catch (e) { debugLog(`Error updating deal fields: ${e}`); }
                    
                    // 2. Add Comment
                    const newComment = `📢 **Новая активность**\nКлиент отправил форму: "${landingTitle}"\n\n${qaString}`;
                    
                    await fetch(`${bitrixUrl}crm.timeline.comment.add`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                           fields: { 
                              ENTITY_ID: activeDealId, 
                              ENTITY_TYPE: "DEAL", 
                              COMMENT: newComment 
                           } 
                        })
                    });
                    
                    log(`Updated deal ${activeDealId} with new submission comment.`);
                    
                    // CLOSE OTHERS (Duplicates)
                    if (duplicates.length > 0) {
                        debugLog(`Closing ${duplicates.length} duplicate deals...`);
                        let mergeComment = "🔗 **Автоматическая склейка (Right-Hand Logic)**\nЗакрыты дублирующие сделки:\n";

                        for (const dup of duplicates) {
                             const oldCategoryId = dup.CATEGORY_ID || 0;
                             const dealLoseStage = oldCategoryId == 0 ? "LOSE" : `C${oldCategoryId}:LOSE`;
                             
                             debugLog(`Closing Duplicate #${dup.ID} in funnel ${oldCategoryId}...`);
                             await fetch(`${bitrixUrl}crm.deal.update`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ 
                                   id: dup.ID, 
                                   fields: { 
                                      STAGE_ID: dealLoseStage,
                                      CLOSED: "Y"
                                   } 
                                })
                             });
                             mergeComment += `- [URL=/crm/deal/details/${dup.ID}/]Сделка #${dup.ID}[/URL] (${dup.TITLE})\n`;
                        }
                        
                         await fetch(`${bitrixUrl}crm.timeline.comment.add`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                               fields: { 
                                  ENTITY_ID: activeDealId, 
                                  ENTITY_TYPE: "DEAL", 
                                  COMMENT: mergeComment 
                               } 
                            })
                        });
                    }

                     await prisma.auditLog.create({
                       data: {
                          userId: user.id,
                          action: "BITRIX_DEAL_UPDATE",
                          entity: "Integration",
                          entityId: String(activeDealId),
                          details: { contactId, funnelId, merged: true, type: "comment_added", duplicatesClosed: duplicates.length }
                       }
                    });

                } else {
                    // CREATE NEW DEAL
                    debugLog("No active deal found. Creating NEW deal...");
                    const dealFields = {
                       TITLE: dealTitle,
                       CATEGORY_ID: funnelId,
                       STAGE_ID: stageId,
                       CONTACT_ID: contactId,
                       OPENED: "Y",
                       UF_CRM_1770370876447: qaString
                    };

                    const dealRes = await fetch(`${bitrixUrl}crm.deal.add`, {
                       method: "POST",
                       headers: { "Content-Type": "application/json" },
                       body: JSON.stringify({ fields: dealFields })
                    });
                    const dealData = await dealRes.json();
                    const newDealId = dealData.result;
                    debugLog(`New Deal created: ${newDealId}`);
                    log(`Deal created: ${JSON.stringify(dealData)}`);
                    
                    await prisma.auditLog.create({
                       data: {
                          userId: user.id,
                          action: "BITRIX_DEAL",
                          entity: "Integration",
                          entityId: String(newDealId),
                          details: { contactId, funnelId, stageId, type: "new_deal" }
                       }
                    });
                }
             }
          }

       } catch (err) {
          console.error("Async integration error:", err);
          const fs = require('fs');
          fs.appendFileSync('/tmp/debug_route.log', `[ERROR] ${String(err)}\n`);
          
          // Log error to AuditLog as well for visibility
          try {
             await prisma.auditLog.create({
                data: {
                   userId: user.id,
                   action: "SUBMISSION_ERROR",
                   entity: "HomeworkSubmission",
                   entityId: submission.id,
                   details: { error: String(err) }
                }
             });
          } catch (e) { /* ignore secondary error */ }
       }
    })();

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
