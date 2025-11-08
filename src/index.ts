import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import mongoose from 'mongoose';
import { z } from 'zod';

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

// Mongoose Schemas
const gameStatSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  clubId: { type: String, index: true },
  playerName: { type: String, required: true },
  opponent: { type: String, required: true },
  position: String,
  playTime: { type: Number, required: true, default: 0 },
  satisfaction: { type: Boolean, required: true, default: true },
  physicalForm: { type: mongoose.Schema.Types.Mixed, required: true },
  mentalForm: { type: mongoose.Schema.Types.Mixed, required: true },
  videoUrl: String,
  videoSource: String,
  actions: { type: mongoose.Schema.Types.Mixed, required: true },
  positiveNotes: { type: mongoose.Schema.Types.Mixed, required: true },
  negativeNotes: { type: mongoose.Schema.Types.Mixed, required: true },
  performanceRating: { type: Number, required: true, default: 5 },
  weeklyFocus: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Number, required: true, index: true },
  updatedAt: { type: Number, required: true }
}, { _id: false });

const clubSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  embleme: String,
  status: { type: String, required: true, default: 'pending', index: true, enum: ['pending', 'validated', 'rejected'] },
  requestedBy: { type: String, required: true },
  validatedBy: String,
  createdAt: { type: Number, required: true },
  updatedAt: { type: Number, required: true }
}, { _id: false });

const clubInviteSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  clubId: { type: String, required: true, index: true },
  inviteCode: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Number, required: true },
  createdAt: { type: Number, required: true }
}, { _id: false });

const recordSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  clubId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  description: String,
  createdBy: { type: String, required: true, index: true },
  createdAt: { type: Number, required: true },
  updatedAt: { type: Number, required: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  email: { type: String, required: true, index: true },
  name: { type: String, required: true },
  picture: String,
  onboarding_completed: { type: Boolean, default: false },
  club_id: String,
  club_status: { type: String, enum: ['pending', 'validated', 'rejected'] },
  is_coach: { type: Boolean, default: false },
  createdAt: { type: Number, required: true },
  updatedAt: { type: Number, required: true }
}, { _id: false });

// Mongoose Models
const GameStat = mongoose.model('GameStat', gameStatSchema);
const Club = mongoose.model('Club', clubSchema);
const ClubInvite = mongoose.model('ClubInvite', clubInviteSchema);
const Record = mongoose.model('Record', recordSchema);
const User = mongoose.model('User', userSchema);

async function initDb() {
  if (!DATABASE_URL) {
    throw new Error('Missing DATABASE_URL env var');
  }
  try {
    await mongoose.connect(DATABASE_URL);
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

const app = Fastify({ logger: true });

// Helper function to generate unique IDs
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const gameStatValidationSchema = z.object({
  _id: z.string().optional(),
  userId: z.string(),
  clubId: z.string().optional().nullable(),
  playerName: z.string(),
  opponent: z.string(),
  position: z.string().optional().nullable(),
  playTime: z.number().int(),
  satisfaction: z.boolean(),
  physicalForm: z.any(),
  mentalForm: z.any(),
  videoUrl: z.string().optional().nullable(),
  videoSource: z.string().optional().nullable(),
  actions: z.any(),
  positiveNotes: z.any(),
  negativeNotes: z.any(),
  performanceRating: z.number().int(),
  weeklyFocus: z.any(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});

const clubValidationSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  embleme: z.string().optional().nullable(),
  status: z.enum(['pending', 'validated', 'rejected']),
  requestedBy: z.string(),
  validatedBy: z.string().optional().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});

const clubInviteValidationSchema = z.object({
  _id: z.string().optional(),
  clubId: z.string(),
  inviteCode: z.string(),
  expiresAt: z.number().int(),
  createdAt: z.number().int()
});

const recordValidationSchema = z.object({
  _id: z.string().optional(),
  clubId: z.string(),
  title: z.string(),
  videoUrl: z.string(),
  description: z.string().optional().nullable(),
  createdBy: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});

const userValidationSchema = z.object({
  _id: z.string().optional(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().optional().nullable(),
  onboarding_completed: z.boolean().optional(),
  club_id: z.string().optional().nullable(),
  club_status: z.enum(['pending', 'validated', 'rejected']).optional().nullable(),
  is_coach: z.boolean().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});

app.get('/health', async () => ({ ok: true }));

// Game Stats endpoints
app.post('/gamestats', async (request, reply) => {
  const parse = gameStatValidationSchema.safeParse(request.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const stat = parse.data;
  const statId = stat._id || generateId('gamestat');

  await GameStat.findOneAndUpdate(
    { _id: statId },
    {
      _id: statId,
      userId: stat.userId,
      clubId: stat.clubId ?? null,
      playerName: stat.playerName,
      opponent: stat.opponent,
      position: stat.position ?? null,
      playTime: stat.playTime,
      satisfaction: stat.satisfaction,
      physicalForm: stat.physicalForm,
      mentalForm: stat.mentalForm,
      videoUrl: stat.videoUrl ?? null,
      videoSource: stat.videoSource ?? null,
      actions: stat.actions,
      positiveNotes: stat.positiveNotes,
      negativeNotes: stat.negativeNotes,
      performanceRating: stat.performanceRating,
      weeklyFocus: stat.weeklyFocus,
      createdAt: stat.createdAt,
      updatedAt: stat.updatedAt
    },
    { upsert: true, new: true }
  );

  return reply.code(201).send({ ok: true, _id: statId });
});

app.get('/gamestats', async (request) => {
  const userId = (request.query as any).userId as string;
  const limit = Number((request.query as any).limit ?? 0);

  let query = GameStat.find({ userId }).sort({ createdAt: -1 });
  if (limit > 0) {
    query = query.limit(limit);
  }

  const docs = await query.exec();
  return docs.map((doc: any) => doc.toObject());
});

app.get('/gamestats/:id', async (request, reply) => {
  const { id } = request.params as any;
  console.log('Getting stat by ID:', id);
  const doc = await GameStat.findById(id).exec();
  if (!doc) return reply.code(404).send({ error: 'Not found' });
  return doc.toObject();
});

app.delete('/gamestats/:id', async (request) => {
  const { id } = request.params as any;
  await GameStat.findByIdAndDelete(id).exec();
  return { ok: true };
});

app.delete('/gamestats', async (request) => {
  const userId = (request.query as any).userId as string;
  if (!userId) {
    return { error: 'userId is required' };
  }
  await GameStat.deleteMany({ userId }).exec();
  return { ok: true };
});

// Get club player stats
app.get('/gamestats/club/:clubId', async (request, reply) => {
  const { clubId } = request.params as any;

  const docs = await GameStat.find({ clubId }).sort({ createdAt: -1 }).exec();
  return docs.map((doc: any) => doc.toObject());
});

// Get club players with aggregated stats
app.get('/clubs/:clubId/players', async (request, reply) => {
  const { clubId } = request.params as any;

  const docs = await GameStat.find({ clubId }).exec();

  // Group stats by userId and aggregate
  const playerMap = new Map<string, {
    _id: string;
    userId: string;
    firstName: string;
    lastName: string;
    stats: {
      matchesPlayed: number;
      tries: number;
      points: number;
      minutesPlayed: number;
      conversions: number;
      penalties: number;
      passPositive: number;
      passNegative: number;
      duelWon: number;
      duelNeutral: number;
      duelLost: number;
      tackleOffensive: number;
      tackleMissed: number;
      tackleSuffered: number;
      faults: number;
    };
  }>();

  for (const stat of docs) {
    const statObj = stat.toObject();
    const userId = statObj.userId;

    if (!playerMap.has(userId)) {
      // Parse player name (assuming format "FirstName LastName")
      const nameParts = (statObj.playerName || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      playerMap.set(userId, {
        _id: userId,
        userId: userId,
        firstName,
        lastName,
        stats: {
          matchesPlayed: 0,
          tries: 0,
          points: 0,
          minutesPlayed: 0,
          conversions: 0,
          penalties: 0,
          passPositive: 0,
          passNegative: 0,
          duelWon: 0,
          duelNeutral: 0,
          duelLost: 0,
          tackleOffensive: 0,
          tackleMissed: 0,
          tackleSuffered: 0,
          faults: 0,
        },
      });
    }

    const player = playerMap.get(userId)!;

    // Aggregate stats
    player.stats.matchesPlayed += 1;
    player.stats.minutesPlayed += statObj.playTime || 0;

    // Count all action types
    const actions = statObj.actions || [];
    for (const action of actions) {
      switch (action.type) {
        case 'try':
          player.stats.tries += 1;
          player.stats.points += 5;
          break;
        case 'conversion':
          player.stats.conversions += 1;
          player.stats.points += 2;
          break;
        case 'penalty':
          player.stats.penalties += 1;
          player.stats.points += 3;
          break;
        case 'pass_positive':
          player.stats.passPositive += 1;
          break;
        case 'pass_negative':
          player.stats.passNegative += 1;
          break;
        case 'duel_won':
          player.stats.duelWon += 1;
          break;
        case 'duel_neutral':
          player.stats.duelNeutral += 1;
          break;
        case 'duel_lost':
          player.stats.duelLost += 1;
          break;
        case 'tackle_offensive':
          player.stats.tackleOffensive += 1;
          break;
        case 'tackle_missed':
          player.stats.tackleMissed += 1;
          break;
        case 'tackle_suffered':
          player.stats.tackleSuffered += 1;
          break;
        case 'fault':
          player.stats.faults += 1;
          break;
      }
    }
  }

  return Array.from(playerMap.values());
});

// Get player aggregated stats by userId
app.get('/players/:userId/stats', async (request, reply) => {
  const { userId } = request.params as any;

  const docs = await GameStat.find({ userId }).exec();

  if (docs.length === 0) {
    return reply.code(404).send({ error: 'Player stats not found' });
  }

  // Get player info from first stat
  const firstStat = docs[0].toObject();
  const nameParts = (firstStat.playerName || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Aggregate stats
  const stats = {
    matchesPlayed: 0,
    tries: 0,
    points: 0,
    minutesPlayed: 0,
    conversions: 0,
    penalties: 0,
    passPositive: 0,
    passNegative: 0,
    duelWon: 0,
    duelNeutral: 0,
    duelLost: 0,
    tackleOffensive: 0,
    tackleMissed: 0,
    tackleSuffered: 0,
    faults: 0,
  };

  for (const stat of docs) {
    const statObj = stat.toObject();

    stats.matchesPlayed += 1;
    stats.minutesPlayed += statObj.playTime || 0;

    // Count all action types
    const actions = statObj.actions || [];
    for (const action of actions) {
      switch (action.type) {
        case 'try':
          stats.tries += 1;
          stats.points += 5;
          break;
        case 'conversion':
          stats.conversions += 1;
          stats.points += 2;
          break;
        case 'penalty':
          stats.penalties += 1;
          stats.points += 3;
          break;
        case 'pass_positive':
          stats.passPositive += 1;
          break;
        case 'pass_negative':
          stats.passNegative += 1;
          break;
        case 'duel_won':
          stats.duelWon += 1;
          break;
        case 'duel_neutral':
          stats.duelNeutral += 1;
          break;
        case 'duel_lost':
          stats.duelLost += 1;
          break;
        case 'tackle_offensive':
          stats.tackleOffensive += 1;
          break;
        case 'tackle_missed':
          stats.tackleMissed += 1;
          break;
        case 'tackle_suffered':
          stats.tackleSuffered += 1;
          break;
        case 'fault':
          stats.faults += 1;
          break;
      }
    }
  }

  return {
    _id: userId,
    userId: userId,
    firstName,
    lastName,
    stats,
  };
});

// Get player progress over time
app.get('/players/:userId/progress', async (request, reply) => {
  const { userId } = request.params as any;

  const docs = await GameStat.find({ userId }).sort({ createdAt: 1 }).exec();

  if (docs.length === 0) {
    return reply.code(404).send({ error: 'Player stats not found' });
  }

  // Cumulative counters
  let cumulativePassPositive = 0;
  let cumulativePassNegative = 0;
  let cumulativeTackleOffensive = 0;
  let cumulativeTackleMissed = 0;
  let cumulativeTackleSuffered = 0;
  let cumulativeDuelWon = 0;
  let cumulativeDuelNeutral = 0;
  let cumulativeDuelLost = 0;
  let cumulativeFaults = 0;
  let cumulativeMinutes = 0;
  let cumulativePerformanceRating = 0;
  let matchCount = 0;

  const progressData: Array<{
    date: number;
    passesAccuracy: number | null;
    tackleAccuracy: number | null;
    duelAccuracy: number | null;
    faults: number;
    minutesPlayed: number;
    performanceRating: number;
  }> = [];

  for (const stat of docs) {
    const statObj = stat.toObject();
    matchCount += 1;
    cumulativeMinutes += statObj.playTime || 0;
    cumulativePerformanceRating += statObj.performanceRating || 0;

    // Count actions for this game
    const actions = statObj.actions || [];
    for (const action of actions) {
      switch (action.type) {
        case 'pass_positive':
          cumulativePassPositive += 1;
          break;
        case 'pass_negative':
          cumulativePassNegative += 1;
          break;
        case 'tackle_offensive':
          cumulativeTackleOffensive += 1;
          break;
        case 'tackle_missed':
          cumulativeTackleMissed += 1;
          break;
        case 'tackle_suffered':
          cumulativeTackleSuffered += 1;
          break;
        case 'duel_won':
          cumulativeDuelWon += 1;
          break;
        case 'duel_neutral':
          cumulativeDuelNeutral += 1;
          break;
        case 'duel_lost':
          cumulativeDuelLost += 1;
          break;
        case 'fault':
          cumulativeFaults += 1;
          break;
      }
    }

    // Calculate percentages
    const totalPasses = cumulativePassPositive + cumulativePassNegative;
    const passesAccuracy = totalPasses > 0 
      ? (cumulativePassPositive / totalPasses) * 100 
      : null;

    const totalTackles = cumulativeTackleOffensive + cumulativeTackleMissed + cumulativeTackleSuffered;
    const tackleAccuracy = totalTackles > 0
      ? ((cumulativeTackleOffensive + cumulativeTackleSuffered) / totalTackles) * 100
      : null;

    const totalDuels = cumulativeDuelWon + cumulativeDuelNeutral + cumulativeDuelLost;
    const duelAccuracy = totalDuels > 0
      ? ((cumulativeDuelWon + cumulativeDuelNeutral) / totalDuels) * 100
      : null;

    const avgPerformanceRating = matchCount > 0 
      ? cumulativePerformanceRating / matchCount 
      : 0;

    progressData.push({
      date: statObj.createdAt,
      passesAccuracy: passesAccuracy !== null ? Math.round(passesAccuracy * 100) / 100 : null,
      tackleAccuracy: tackleAccuracy !== null ? Math.round(tackleAccuracy * 100) / 100 : null,
      duelAccuracy: duelAccuracy !== null ? Math.round(duelAccuracy * 100) / 100 : null,
      faults: cumulativeFaults,
      minutesPlayed: cumulativeMinutes,
      performanceRating: Math.round(avgPerformanceRating * 10) / 10,
    });
  }

  return progressData;
});

// Club endpoints
app.post('/clubs', async (request, reply) => {
  const parse = clubValidationSchema.safeParse(request.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const club = parse.data;
  const clubId = club._id || generateId('club');

  await Club.findOneAndUpdate(
    { _id: clubId },
    {
      _id: clubId,
      name: club.name,
      embleme: club.embleme ?? null,
      status: club.status,
      requestedBy: club.requestedBy,
      validatedBy: club.validatedBy ?? null,
      createdAt: club.createdAt,
      updatedAt: club.updatedAt
    },
    { upsert: true, new: true }
  );

  return reply.code(201).send({ ok: true, _id: clubId });
});

app.get('/clubs', async (request) => {
  const status = (request.query as any).status as string;
  const limit = Number((request.query as any).limit ?? 0);

  const filter: any = {};
  if (status) {
    filter.status = status;
  }

  let query = Club.find(filter).sort({ createdAt: -1 });
  if (limit > 0) {
    query = query.limit(limit);
  }

  const docs = await query.exec();
  return docs.map((doc: any) => doc.toObject());
});

// Search clubs endpoint
app.get('/clubs/search', async (request) => {
  const search = (request.query as any).q as string;
  const limit = Number((request.query as any).limit ?? 20);

  if (!search || search.trim().length === 0) {
    return [];
  }

  const filter: any = {
    name: { $regex: search.trim(), $options: 'i' }
  };

  const docs = await Club.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map((doc: any) => doc.toObject());
});

// Get club statistics
app.get('/clubs/stats', async () => {
  const [pending, validated, rejected, total] = await Promise.all([
    Club.countDocuments({ status: 'pending' }).exec(),
    Club.countDocuments({ status: 'validated' }).exec(),
    Club.countDocuments({ status: 'rejected' }).exec(),
    Club.countDocuments({}).exec(),
  ]);

  return {
    pending,
    validated,
    rejected,
    total,
  };
});

app.get('/clubs/:id', async (request, reply) => {
  const { id } = request.params as any;
  const doc = await Club.findById(id).exec();
  if (doc === null) return reply.code(404).send({ error: 'Club not found' });
  return doc.toObject();
});

app.patch('/clubs/:id', async (request, reply) => {
  const { id } = request.params as any;
  const body = request.body as any;

  const doc = await Club.findById(id).exec();
  if (!doc) return reply.code(404).send({ error: 'Club not found' });

  const allowedFields = ['status', 'validatedBy', 'name', 'embleme'];
  const updates: any = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(body)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates[key] = value;
    }
  }

  await Club.findByIdAndUpdate(id, updates, { new: true }).exec();

  return { ok: true };
});

// Club invite endpoints
app.post('/club-invites', async (request, reply) => {
  const parse = clubInviteValidationSchema.safeParse(request.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const invite = parse.data;
  const inviteId = invite._id || generateId('invite');

  await ClubInvite.findOneAndUpdate(
    { _id: inviteId },
    {
      _id: inviteId,
      clubId: invite.clubId,
      inviteCode: invite.inviteCode,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt
    },
    { upsert: true, new: true }
  );

  return reply.code(201).send({ ok: true, _id: inviteId });
});

app.get('/club-invites', async (request) => {
  const clubId = (request.query as any).clubId as string;

  if (!clubId) {
    return [];
  }

  const docs = await ClubInvite.find({ clubId, expiresAt: { $gt: Date.now() } })
    .sort({ createdAt: -1 })
    .exec();
  return docs.map((doc: any) => doc.toObject());
});

app.get('/club-invites/:code', async (request, reply) => {
  const { code } = request.params as any;

  const invite = await ClubInvite.findOne({
    inviteCode: code,
    expiresAt: { $gt: Date.now() }
  }).exec();

  if (!invite) {
    return reply.code(404).send({ error: 'Invalid or expired invite code' });
  }

  const club = await Club.findById(invite.clubId).exec();
  if (!club) {
    return reply.code(404).send({ error: 'Club not found' });
  }

  return {
    ...invite.toObject(),
    clubName: club.name,
    clubStatus: club.status
  };
});

// Join a club directly by club ID
app.post('/clubs/:clubId/join', async (request, reply) => {
  const { clubId } = request.params as any;
  const { userId, isCoach } = request.body as any;

  if (!userId) {
    return reply.code(400).send({ error: 'userId is required' });
  }

  // Validate club exists
  const club = await Club.findById(clubId).exec();
  if (!club) {
    return reply.code(404).send({ error: 'Club not found' });
  }

  // Check club status - reject if pending or rejected
  if (club.status === 'pending') {
    return reply.code(400).send({ error: 'Club is pending validation' });
  }

  if (club.status === 'rejected') {
    return reply.code(400).send({ error: 'Club has been rejected' });
  }

  // Update user to join the club
  const user = await User.findById(userId).exec();
  if (!user) {
    return reply.code(404).send({ error: 'User not found' });
  }

  const updates: any = {
    club_id: clubId,
    club_status: club.status,
    onboarding_completed: true,
    updatedAt: Date.now()
  };

  // Set coach mode if provided
  if (isCoach !== undefined) {
    updates.is_coach = isCoach === true || isCoach === 'true';
  }

  await User.findByIdAndUpdate(userId, updates, { new: true }).exec();

  return { ok: true, clubId, clubName: club.name };
});

// Legacy endpoint - kept for backwards compatibility but deprecated
app.post('/club-invites/:code/use', async (request, reply) => {
  const { code } = request.params as any;
  const { userId } = request.body as any;

  if (!userId) {
    console.error('userId is required');
    return reply.code(400).send({ error: 'userId is required' });
  }

  const invite = await ClubInvite.findOne({
    inviteCode: code,
    expiresAt: { $gt: Date.now() }
  }).exec();

  if (!invite) {
    return reply.code(404).send({ error: 'Invalid or expired invite code' });
  }

  const club = await Club.findById(invite.clubId).exec();
  if (!club) {
    console.error('Club not found');
    return reply.code(404).send({ error: 'Club not found' });
  }

  if (club.status !== 'validated') {
    return reply.code(400).send({ error: 'Club is not validated yet' });
  }

  return { ok: true, clubId: invite.clubId };
});

// Record endpoints
app.post('/records', async (request, reply) => {
  const parse = recordValidationSchema.safeParse(request.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const record = parse.data;
  const recordId = record._id || generateId('record');

  await Record.findOneAndUpdate(
    { _id: recordId },
    {
      _id: recordId,
      clubId: record.clubId,
      title: record.title,
      videoUrl: record.videoUrl,
      description: record.description ?? null,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    },
    { upsert: true, new: true }
  );

  return reply.code(201).send({ ok: true, _id: recordId });
});

app.get('/records', async (request) => {
  const clubId = (request.query as any).clubId as string;

  if (!clubId) {
    return [];
  }

  const docs = await Record.find({ clubId }).sort({ createdAt: -1 }).exec();
  return docs.map((doc: any) => doc.toObject());
});

app.get('/records/:id', async (request, reply) => {
  const { id } = request.params as any;
  const doc = await Record.findById(id).exec();
  if (doc === null) return reply.code(404).send({ error: 'Record not found' });
  return doc.toObject();
});

app.patch('/records/:id', async (request, reply) => {
  const { id } = request.params as any;
  const body = request.body as any;

  const doc = await Record.findById(id).exec();
  if (!doc) return reply.code(404).send({ error: 'Record not found' });

  const allowedFields = ['title', 'videoUrl', 'description'];
  const updates: any = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(body)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates[key] = value;
    }
  }

  await Record.findByIdAndUpdate(id, updates, { new: true }).exec();

  return { ok: true };
});

app.delete('/records/:id', async (request) => {
  const { id } = request.params as any;
  await Record.findByIdAndDelete(id).exec();
  return { ok: true };
});

// User endpoints
app.post('/users', async (request, reply) => {
  const parse = userValidationSchema.safeParse(request.body);
  if (!parse.success) {
    return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
  }
  const user = parse.data;
  // For users, we use the Auth0 ID if provided, otherwise generate one
  const userId = user._id || generateId('user');

  await User.findOneAndUpdate(
    { _id: user._id },
    {
      _id: user._id,
      email: user.email,
      name: user.name,
      picture: user.picture ?? null,
      onboarding_completed: user.onboarding_completed ?? false,
      club_id: user.club_id ?? null,
      club_status: user.club_status ?? null,
      is_coach: user.is_coach ?? false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    { upsert: true, new: true }
  );

  return reply.code(201).send({ ok: true, _id: userId });
});

app.get('/users/:id', async (request, reply) => {
  const { id } = request.params as any;
  const doc = await User.findById(id).exec();
  if (doc === null) return reply.code(404).send({ error: 'User not found' });
  return doc.toObject();
});

app.patch('/users/:id', async (request, reply) => {
  const { id } = request.params as any;
  const body = request.body as any;

  const doc = await User.findById(id).exec();
  if (!doc) return reply.code(404).send({ error: 'User not found' });

  const allowedFields = ['name', 'picture', 'onboarding_completed', 'club_id', 'club_status', 'is_coach'];
  const updates: any = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(body)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates[key] = value;
    }
  }

  await User.findByIdAndUpdate(id, updates, { new: true }).exec();

  return { ok: true };
});

// Get all users (for admin)
app.get('/users', async (request) => {
  const limit = Number((request.query as any).limit ?? 20);

  let query = User.find({}).sort({ createdAt: -1 });
  if (limit > 0) {
    query = query.limit(limit);
  }

  const docs = await query.exec();
  return docs.map((doc) => doc.toObject());
});

// Search users endpoint
app.get('/users/search', async (request) => {
  const search = (request.query as any).q as string;
  const limit = Number((request.query as any).limit ?? 20);

  if (!search || search.trim().length === 0) {
    return [];
  }

  const searchRegex = { $regex: search.trim(), $options: 'i' };
  const filter: any = {
    $or: [
      { name: searchRegex },
      { email: searchRegex }
    ]
  };

  const docs = await User.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return docs.map((doc: any) => doc.toObject());
});

// Get user statistics
app.get('/users/stats', async () => {
  const [total, coaches, players] = await Promise.all([
    User.countDocuments({}).exec(),
    User.countDocuments({ is_coach: true }).exec(),
    User.countDocuments({ is_coach: false }).exec(),
  ]);

  return {
    total,
    coaches,
    players,
  };
});

// Get users by club
app.get('/users/club/:clubId', async (request) => {
  const { clubId } = request.params as any;

  const docs = await User.find({ club_id: clubId }).sort({ name: 1 }).exec();
  return docs.map((doc: any) => doc.toObject());
});

async function start() {
  try {
    // Initialize database
    await initDb();

    // Register CORS
    await app.register(cors, { origin: true });

    // Start server
    await app.listen({ host: '0.0.0.0', port: PORT });
    console.log(`🚀 API server running on port ${PORT} with MongoDB database`);
  } catch (error) {
    console.error('Failed to start API server:', error);
    process.exit(1);
  }
}

start();
