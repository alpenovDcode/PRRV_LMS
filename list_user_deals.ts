
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const email = "hssdjfhsdjhf@gmail.com";
const bitrixUrl = "https://prrv.bitrix24.ru/rest/2614/s1kt2i2c4xhruk41/";

async function main() {
  console.log(`--- Listing Active Deals for ${email} ---`);

  // 1. Find Contact
  let contactId = null;
  const searchRes = await fetch(`${bitrixUrl}crm.contact.list?filter[EMAIL]=${email}&select[]=ID`);
  const searchData = await searchRes.json();
  contactId = searchData.result?.[0]?.ID;
  
  if (!contactId) {
      console.log("Contact not found.");
      return;
  }
  console.log(`Contact ID: ${contactId}`);

  // 2. List Deals
  const dealsRes = await fetch(`${bitrixUrl}crm.deal.list?filter[CONTACT_ID]=${contactId}&filter[CLOSED]=N&select[]=ID&select[]=TITLE&select[]=STAGE_ID&select[]=DATE_CREATE&order[DATE_CREATE]=DESC`);
  const dealsData = await dealsRes.json();
  const deals = dealsData.result || [];

  console.log(`Found ${deals.length} active deals:`);
  deals.forEach(d => {
      console.log(`- [#${d.ID}] ${d.TITLE} | Stage: ${d.STAGE_ID} | Created: ${d.DATE_CREATE}`);
  });
}

main();
