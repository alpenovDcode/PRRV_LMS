
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// MOCK DATA for testing
const email = "testing_merge@example.com";
const phone = "+79990001122";
const fullName = "Test Merge User";
const funnelId = "14";
const stageId = "C14:PREPAYMENT_INVOIC";
const bitrixUrl = "https://prrv.bitrix24.ru/rest/2614/s1kt2i2c4xhruk41/";

async function main() {
  console.log("--- STARTING BITRIX TEST ---");

  // 1. Find/Create Contact
  console.log(`1. Searching contact by email: ${email}`);
  let contactId = null;

  try {
    const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${email}&select[]=ID`);
    const searchData = await searchRes.json();
    contactId = searchData.result?.[0]?.ID;
    console.log(`   Search Result:`, searchData);
  } catch (e) {
    console.error(`   Search Failed:`, e);
  }

  if (!contactId) {
    console.log(`   Contact not found. Creating new...`);
    const createContactRes = await fetch(`${bitrixUrl}crm.contact.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            fields: {
                NAME: fullName,
                EMAIL: [{ VALUE: email, VALUE_TYPE: "WORK" }],
                PHONE: [{ VALUE: phone, VALUE_TYPE: "WORK" }],
                SOURCE_ID: "WEB",
                OPENED: "Y"
            }
        })
    });
    const createData = await createContactRes.json();
    contactId = createData.result;
    console.log(`   Created Contact ID: ${contactId}`);
  } else {
    console.log(`   Found Contact ID: ${contactId}`);
  }

  if (!contactId) {
      console.error("CRITICAL: Include to get Contact ID");
      return;
  }

  // 2. Create NEW Deal
  console.log("2. Creating NEW Deal (Master)...");
  const dealFields = {
      TITLE: "Test Merge Deal " + Date.now(),
      CATEGORY_ID: funnelId,
      STAGE_ID: stageId,
      CONTACT_ID: contactId,
      OPENED: "Y"
  };

  const dealRes = await fetch(`${bitrixUrl}crm.deal.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: dealFields })
  });
  const dealData = await dealRes.json();
  const newDealId = dealData.result;
  console.log(`   New Deal Created: ${newDealId}`);

  // 3. Search for OTHERS
  console.log("3. Searching for OLD open deals...");
  const oldDealsRes = await fetch(`${bitrixUrl}crm.deal.list?filter[CONTACT_ID]=${contactId}&filter[CLOSED]=N&select[]=ID&select[]=TITLE&select[]=CATEGORY_ID`);
  const oldDealsData = await oldDealsRes.json();
  const oldDeals = oldDealsData.result || [];
  
  console.log(`   Found ${oldDeals.length} open deals total.`);
  
  const dealsToClose = oldDeals.filter(d => d.ID != newDealId);
  console.log(`   Found ${dealsToClose.length} deals to CLOSE (excluding new one).`);

  // 4. Close loop
  const loseStage = `C${funnelId}:LOSE`;
  console.log(`   Using Lose Stage: ${loseStage}`);

  for (const oldDeal of dealsToClose) {
      console.log(`   -> Closing Deal #${oldDeal.ID} (${oldDeal.TITLE})...`);
      
      const updateRes = await fetch(`${bitrixUrl}crm.deal.update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            id: oldDeal.ID, 
            fields: { 
                STAGE_ID: loseStage,
                CLOSED: "Y" 
            } 
        })
      });
      console.log(`      Update Result:`, await updateRes.json());
      
      // Comment
      console.log(`   -> Adding comment to New Deal #${newDealId}...`);
      await fetch(`${bitrixUrl}crm.timeline.comment.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
            fields: { 
                ENTITY_ID: newDealId, 
                ENTITY_TYPE: "DEAL", 
                COMMENT: `Merged old deal #${oldDeal.ID}` 
            } 
            })
      });
  }
  
  console.log("--- TEST FINISHED ---");
}

main();
