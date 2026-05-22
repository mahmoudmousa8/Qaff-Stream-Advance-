import { areSlotsOverlapping } from '../src/lib/schedule-validator.ts';

const slotA = {
  slotIndex: 0,
  schedStart: "05-22 15:00",
  schedStop: "05-22 16:00",
  daily: true,
  weekly: false
};

const slotB = {
  slotIndex: 1,
  schedStart: "05-22 15:30",
  schedStop: "05-22 16:30",
  daily: true,
  weekly: false
};

console.log("Checking overlap...");
const start = Date.now();
const overlap = areSlotsOverlapping(slotA, slotB, new Date());
console.log("Overlap result:", overlap, "time taken:", Date.now() - start, "ms");
