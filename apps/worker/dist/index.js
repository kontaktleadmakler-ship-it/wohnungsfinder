import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';
const config = z.object({ MONGODB_URI: z.string().min(1), ALLOWED_FEED_URL: z.string().url().optional() }).parse(process.env);
const objectId = Schema.Types.ObjectId;
const Profile = mongoose.model('Profile', new Schema({ userId: objectId, name: String, locations: [{ city: String, districts: [String] }], radiusKm: Number, rent: { coldMin: Number, coldMax: Number, warmMin: Number, warmMax: Number }, rooms: { min: Number, max: Number }, area: { min: Number, max: Number }, propertyTypes: [String], features: [String], availableFrom: Date, active: Boolean }));
const Listing = mongoose.model('Listing', new Schema({ source: String, externalId: String, canonicalUrl: String, title: String, city: String, district: String, postalCode: String, address: String, coldRent: Number, warmRent: Number, rooms: Number, areaSqm: Number, propertyType: String, features: [String], availableFrom: Date, fingerprint: String, firstSeenAt: Date, lastSeenAt: Date, isActive: Boolean }, { timestamps: true }));
Listing.schema.index({ source: 1, externalId: 1 }, { unique: true });
const Match = mongoose.model('Match', new Schema({ userId: objectId, profileId: objectId, listingId: objectId, score: Number, reasons: [String], status: { type: String, default: 'new' }, notifiedAt: Date }, { timestamps: true }));
Match.schema.index({ profileId: 1, listingId: 1 }, { unique: true });
const candidateSchema = z.object({ source: z.string().min(1), externalId: z.string().min(1), canonicalUrl: z.string().url(), title: z.string(), city: z.string(), district: z.string().optional(), postalCode: z.string().optional(), address: z.string().optional(), coldRent: z.number().nonnegative().optional(), warmRent: z.number().nonnegative().optional(), rooms: z.number().positive().optional(), areaSqm: z.number().positive().optional(), propertyType: z.enum(['wg', 'apartment', 'house']).optional(), features: z.array(z.string()).default([]), availableFrom: z.coerce.date().optional() });
// Jeder produktive Adapter muss eine dokumentierte Erlaubnis/API-Lizenz besitzen.
async function allowedFeed() { if (!config.ALLOWED_FEED_URL)
    return []; const response = await fetch(config.ALLOWED_FEED_URL, { headers: { 'User-Agent': 'Wohnungsfinder/1.0 contact=operations@example.invalid' } }); if (!response.ok)
    throw new Error(`Feed antwortet mit ${response.status}`); return z.array(candidateSchema).parse(await response.json()); }
const norm = (x = '') => x.toLowerCase().trim().replace(/\s+/g, '');
const fingerprint = (x) => crypto.createHash('sha256').update([norm(x.address), norm(x.postalCode), x.rooms ?? '', x.areaSqm ?? '', Math.round((x.warmRent ?? x.coldRent ?? 0) / 25) * 25].join('|')).digest('hex');
function score(profile, listing) { const rentMax = profile.rent?.warmMax ?? profile.rent?.coldMax; const listingRent = listing.warmRent ?? listing.coldRent; if (rentMax && listingRent && listingRent > rentMax)
    return null; if (profile.rooms?.min && (!listing.rooms || listing.rooms < profile.rooms.min))
    return null; if (profile.rooms?.max && listing.rooms && listing.rooms > profile.rooms.max)
    return null; if (profile.area?.min && (!listing.areaSqm || listing.areaSqm < profile.area.min))
    return null; if (profile.area?.max && listing.areaSqm && listing.areaSqm > profile.area.max)
    return null; const location = profile.locations?.find((l) => norm(l.city) === norm(listing.city)); if (!location)
    return null; const reasons = [`Ort: ${listing.city}`]; let points = 45; if (rentMax && listingRent) {
    points += Math.max(0, Math.min(25, Math.round((1 - listingRent / rentMax) * 100)));
    reasons.push(`Miete: ${listingRent} €`);
} if (listing.rooms) {
    points += 15;
    reasons.push(`${listing.rooms} Zimmer`);
} const wanted = new Set(profile.features ?? []), supplied = new Set(listing.features ?? []), overlaps = [...wanted].filter((f) => supplied.has(f)); points += Math.min(15, overlaps.length * 5); if (overlaps.length)
    reasons.push(`Ausstattung: ${overlaps.join(', ')}`); return { score: Math.min(100, points), reasons }; }
async function run() { await mongoose.connect(config.MONGODB_URI); const candidates = await allowedFeed(); let created = 0; for (const input of candidates) {
    const now = new Date(), fp = fingerprint(input);
    const listing = await Listing.findOneAndUpdate({ source: input.source, externalId: input.externalId }, { $set: { ...input, fingerprint: fp, lastSeenAt: now, isActive: true }, $setOnInsert: { firstSeenAt: now } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    const profiles = await Profile.find({ active: true });
    for (const profile of profiles) {
        const result = score(profile, listing);
        if (!result)
            continue;
        const upsert = await Match.updateOne({ profileId: profile._id, listingId: listing._id }, { $setOnInsert: { userId: profile.userId, score: result.score, reasons: result.reasons, status: 'new' } }, { upsert: true });
        if (upsert.upsertedCount)
            created++;
    }
} console.log(`Verarbeitet: ${candidates.length} Inserate, neue Matches: ${created}`); await mongoose.disconnect(); }
run().catch(async (error) => { console.error(error); await mongoose.disconnect(); process.exit(1); });
