const BITRIX_WEBHOOK_URL = "https://b24-4l2k8u.bitrix24.ru/rest/1/10000000/"; // Hardcoded for test
const TEST_EMAIL = "hssdjfhsdjhf@gmail.com";
const FUNNEL_ID = "14"; // Default funnel

async function main() {
  const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL || BITRIX_WEBHOOK_URL;
  const funnelId = process.env.BITRIX_FUNNEL_ID || FUNNEL_ID;

  console.log("--- STARTING BITRIX TEST (Re-open + Full Merge) ---");

  try {
      // 0. Fetch Stage Order for Funnel (to determine "Right-most")
      console.log(`0. Fetching stages for funnel ${funnelId}...`);
      const stagesRes = await fetch(`${bitrixUrl}crm.dealcategory.stage.list?id=${funnelId}`);
      const stagesData = await stagesRes.json();
      const stages = stagesData.result || [];
      
      // Create a map of StageID -> SortIndex (higher is "more right")
      const stageSortMap = {};
      stages.forEach(s => {
          stageSortMap[s.STATUS_ID] = parseInt(s.SORT);
      });
      console.log(`   Mapped ${stages.length} stages.`);

      // 1. Find Contact
      console.log(`1. Searching contact by email: ${TEST_EMAIL}`);
      const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${TEST_EMAIL}&select[]=ID`);
      const searchData = await searchRes.json();
      const contactId = searchData.result?.[0]?.ID;
      console.log("   Search Result:", searchData);

      if (contactId) {
          console.log(`   Found Contact ID: ${contactId}`);

          // 1.5 SETUP: Re-open specific test deal #239658
          console.log("   [SETUP] Re-opening deal #239658 for testing (Stage=NEW, Closed=N)...");
          await fetch(`${bitrixUrl}crm.deal.update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                 id: 239658, 
                 fields: { 
                    CLOSED: "N",
                    STAGE_ID: "C14:NEW" // Move to initial stage
                 } 
              })
          });
          
          console.log("   [SETUP] Waiting 2s for propagation...");
          await new Promise(r => setTimeout(r, 2000));

          // 2. Find Active Deals
          console.log("2. Searching for EXISTING active deals...");
          // Initial fetch to get IDs and Stages
          const activeDealsRes = await fetch(`${bitrixUrl}crm.deal.list?filter[CONTACT_ID]=${contactId}&filter[CLOSED]=N&select[]=ID&select[]=TITLE&select[]=STAGE_ID&select[]=CATEGORY_ID&select[]=DATE_CREATE`);
          const activeDealsData = await activeDealsRes.json();
          const activeDeals = activeDealsData.result || [];
          console.log(`   Found ${activeDeals.length} active deals.`);

          if (activeDeals.length > 0) {
              // 3. Select Master Deal (Right-most Stage)
              let masterDeal = activeDeals[0];
              let maxSort = -1;

              // Determine initial max sort
              const initSort = stageSortMap[masterDeal.STAGE_ID];
              maxSort = initSort !== undefined ? initSort : -1;

              for (const deal of activeDeals) {
                  const sId = deal.STAGE_ID;
                  const sort = stageSortMap[sId] !== undefined ? stageSortMap[sId] : -1;
                  
                  if (sort > maxSort) {
                      maxSort = sort;
                      masterDeal = deal;
                  } else if (sort === maxSort) {
                      // Tie-breaker: Prefer Newest (ID DESC)
                      if (parseInt(deal.ID) > parseInt(masterDeal.ID)) {
                           masterDeal = deal;
                      }
                  }
              }

              const masterDealId = masterDeal.ID;
              console.log(`   Selected MASTER Deal: #${masterDealId} (${masterDeal.TITLE}) - Stage: ${masterDeal.STAGE_ID} (Sort: ${maxSort})`);

              // 3.1 Fetch FULL DATA for Master Deal using crm.deal.get
              console.log(`   Fetching FULL DATA for Master Deal #${masterDealId}...`);
              const masterRes = await fetch(`${bitrixUrl}crm.deal.get?id=${masterDealId}`);
              const masterData = await masterRes.json();
              const masterFull = masterData.result;

              if (!masterFull) {
                  console.error("CRITICAL: Could not fetch Master Deal details.");
                  return;
              }

              // 4. Merge Fields from Duplicates -> Master
              const duplicates = activeDeals.filter(d => d.ID !== masterDealId);
              let mergedFields = {}; // Dictionary to hold fields to update
              
              if (duplicates.length > 0) {
                  console.log(`   Merging fields from ${duplicates.length} duplicates...`);
                  
                  // Sort duplicates by ID ASC (Oldest -> Newest)
                  duplicates.sort((a, b) => parseInt(a.ID) - parseInt(b.ID));

                  for (const dupStub of duplicates) {
                      console.log(`   -> Fetching FULL DATA for Duplicate #${dupStub.ID} (${dupStub.TITLE})...`);
                      const dupRes = await fetch(`${bitrixUrl}crm.deal.get?id=${dupStub.ID}`);
                      const dupData = await dupRes.json();
                      const dupFull = dupData.result;

                      if (!dupFull) {
                           console.log(`      [Warn] Could not fetch data for duplicate #${dupStub.ID}`);
                           continue;
                      }

                      console.log(`      [Scan] Comparing fields... Keys found: ${Object.keys(dupFull).length}`);
                      // Iterate over all keys
                      for (const key of Object.keys(dupFull)) {
                          
                          // STRICT SKIP LIST
                          if (["ID", "TITLE", "DATE_CREATE", "STAGE_ID", "CATEGORY_ID", "IS_RECURRING", "IS_RETURN_CUSTOMER", "IS_REPEATED_APPROACH", "CREATED_BY_ID", "MODIFY_BY_ID", "DATE_MODIFY", "OPENED", "CLOSED", "CURRENCY_ID"].includes(key)) {
                              continue;
                          }

                          const val = dupFull[key];
                          const masterVal = masterFull[key];

                          // Debug Log for UF fields
                          if (key.startsWith("UF_")) {
                              // console.log(`         [Check] ${key}: Dup="${val}" | Master="${masterVal}"`);
                          }
                          
                          const isDupHasValue = val !== null && val !== "" && val !== undefined && val !== "0.00" && 
                                                !(Array.isArray(val) && val.length === 0);

                          if (isDupHasValue) {
                              // Check if Master is "empty"
                              // Enhanced check: null, undefined, empty string, whitespace string, empty array, or 0.00 opportunity
                              let isMasterEmpty = 
                                  masterVal === null || 
                                  masterVal === undefined || 
                                  (typeof masterVal === "string" && masterVal.trim() === "") ||
                                  (Array.isArray(masterVal) && masterVal.length === 0) ||
                                  (key === "OPPORTUNITY" && parseFloat(masterVal) === 0);

                              // SPECIAL RULE: For user-listed fields (or all UF fields?), we might want to overwrite "0" with "1"
                              // The user listed specific fields. Let's assume for ALL UF_ fields, "0" is weak.
                              // Or simply: If Master is "0" and Dup is "1", Merge.
                              if (!isMasterEmpty && key.startsWith("UF_")) {
                                   if (masterVal === "0" || masterVal === 0 || masterVal === "No" || masterVal === false) {
                                       // If duplicate has a "stronger" value (not 0, not No, not false)
                                       if (val !== "0" && val !== 0 && val !== "No" && val !== false) {
                                            console.log(`      [OVERRIDE] ${key}: Master="${masterVal}" (Weak) -> Duplicate="${val}" (Strong)`);
                                            isMasterEmpty = true;
                                       }
                                   }
                              }

                              if (isMasterEmpty) {
                                  console.log(`      [MERGE] ${key}: Duplicate="${val}" -> Master (was "${masterVal}")`);
                                  mergedFields[key] = val;
                              } else if (JSON.stringify(val) != JSON.stringify(masterVal)) {
                                   // Log collision
                                   console.log(`      [SKIP] ${key}: Collision. Master="${masterVal}" | Dup="${val}"`);
                              }
                          }
                      }
                  }
              }

              // 5. Update Master Deal
              if (Object.keys(mergedFields).length > 0) {
                  console.log(`   Updating Master with merged fields:`, Object.keys(mergedFields));
                  // console.log(JSON.stringify(mergedFields, null, 2));

                  const updateRes = await fetch(`${bitrixUrl}crm.deal.update`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ 
                         id: masterDealId, 
                         fields: mergedFields
                      })
                  });
                   console.log(`   -> Fields Updated:`, await updateRes.json());
              } else {
                  console.log(`   No new fields to merge.`);
              }

              // Add Comment
              const newComment = `📢 **Новая активность**\nDeal Merged (Re-open + Full Scan).\nTime: ${new Date().toISOString()}`;
              await fetch(`${bitrixUrl}crm.timeline.comment.add`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                     fields: { 
                        ENTITY_ID: masterDealId, 
                        ENTITY_TYPE: "DEAL", 
                        COMMENT: newComment 
                     } 
                  })
              });
              console.log(`   -> DATA UPDATED in Master Deal #${masterDealId}.`);

              // 6. Close Duplicates
              for (const dup of duplicates) {
                   const oldCategoryId = dup.CATEGORY_ID || 0;
                   const dealLoseStage = oldCategoryId == 0 ? "LOSE" : `C${oldCategoryId}:LOSE`;
                   
                   console.log(`   Closing Duplicate #${dup.ID} in funnel ${oldCategoryId}...`);
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
              }

          } else {
              console.log("   No active deals found. Creating NEW...");
              // ... create logic ...
          }
      }
  } catch (e) {
      console.error("Error:", e);
  }
}

main();