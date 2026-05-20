#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'

async function main() {
    const prisma = new PrismaClient()

    try {
        console.log('🌱 Seeding database...')

        // 1. Seed Users
        const userCount = await prisma.user.count()
        if (userCount === 0) {
            console.log('Creating default users...')
            // Create Admin
            await prisma.user.create({
                data: {
                    username: 'admin',
                    password: 'admin2026', // Plain text as requested
                    role: 'admin',
                    slotsLimit: 0,
                    renewalDate: '',
                    securityKey: '',
                }
            })
            console.log('✅ Admin user created: admin / admin2026')

            // Create Normal User (Client)
            await prisma.user.create({
                data: {
                    username: 'user',
                    password: 'user2026', // Plain text as requested
                    role: 'user',
                    slotsLimit: 50,
                    renewalDate: '2026-12-31',
                    securityKey: 'qaff-key-123',
                }
            })
            console.log('✅ Client user created: user / user2026')
        } else {
            console.log('User table already seeded.')
        }

        // 2. Seed Stream Slots (100 slots by default)
        const slotCount = await prisma.streamSlot.count()
        if (slotCount === 0) {
            console.log('Creating 100 stream slots...')
            const slotsData = []
            for (let i = 0; i < 100; i++) {
                slotsData.push({
                    slotIndex: i,
                    channelName: `Slot ${i + 1}`,
                    outputType: 'youtube',
                    streamKey: '',
                    rtmpServer: 'rtmp://a.rtmp.youtube.com/live2',
                    filePath: '',
                    inputType: 'file', // Default to recorded file
                    liveInputUrl: '',
                    schedStart: '',
                    schedStop: '',
                    daily: false,
                    weekly: false,
                    isScheduled: false,
                    manuallyStopped: true,
                    nextRunTime: '',
                    status: 'Stopped',
                    isRunning: false,
                })
            }
            // Use createMany if supported by sqlite or loop it. Sqlite in prisma supports createMany!
            await prisma.streamSlot.createMany({
                data: slotsData,
            })
            console.log('✅ 100 stream slots initialized successfully.')
        } else {
            console.log(`StreamSlot table already populated with ${slotCount} slots.`)
        }

        console.log('🌱 Seeding complete!')
    } catch (error) {
        console.error('❌ Seeding failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
