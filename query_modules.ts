import { db } from "./lib/db";
async function run() {
  const modules = await db.module.findMany({
    where: { 
      OR: [
        { openAfterEvent: { not: null } },
        { openAt: { not: null } }
      ]
    },
    select: { 
      id: true, title: true, openAt: true, openAfterEvent: true, openAfterAmount: true, openAfterUnit: true 
    }
  });
  console.log(JSON.stringify(modules, null, 2));
}
run();
