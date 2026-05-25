const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
    let list = await db.titleDescList.findFirst();
    if (!list) { 
        list = await db.titleDescList.create({
            data: {
                name: 'Test List',
                items: JSON.stringify({pairs: [{id: '1', title: 'test', description: 'test'}]})
            }
        });
        console.log('Created test list:', list.id);
    }
    
    console.log('Using list ID:', list.id);
    
    const result = await db.streamSlot.updateMany({
        where: {},
        data: { titleDescListId: list.id }
    });
    console.log('Update result:', result);
    
    const slots = await db.streamSlot.findMany({ take: 2 });
    console.log(slots.map(s => s.titleDescListId));
}
main().catch(console.error).finally(() => db.$disconnect());
