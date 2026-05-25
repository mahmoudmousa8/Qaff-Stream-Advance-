const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
    const list = await db.titleDescList.findFirst();
    if (!list) { console.log('no lists'); return; }
    
    console.log('Using list ID:', list.id);
    
    const result = await db.streamSlot.updateMany({
        where: {},
        data: { titleDescListId: list.id }
    });
    console.log('Update result:', result);
    
    const slots = await db.streamSlot.findMany({ take: 5 });
    console.log(slots.map(s => s.titleDescListId));
}
main().catch(console.error).finally(() => db.$disconnect());
