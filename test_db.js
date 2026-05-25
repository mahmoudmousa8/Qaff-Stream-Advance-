const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.streamSlot.findMany({ take: 5 }).then(slots => {
    console.log(slots.map(s => s.titleDescListId));
    db.$disconnect();
});
