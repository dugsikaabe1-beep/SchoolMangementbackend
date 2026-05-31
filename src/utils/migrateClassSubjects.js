import Subject from '../models/Subject.js';
import ClassSubject from '../models/ClassSubject.js';
import Class from '../models/Class.js';

/**
 * One-time style migration: legacy Subject documents had class + teacher.
 * Copies those links into ClassSubject and optionally syncs Class.subjects array refs (legacy).
 */
export default async function migrateLegacySubjectsToClassSubjects() {
  try {
    const legacy = await Subject.collection
      .find({ class: { $exists: true, $ne: null } })
      .toArray();

    let upserted = 0;
    for (const doc of legacy) {
      if (!doc.class || !doc.school) continue;
      await ClassSubject.findOneAndUpdate(
        { class: doc.class, subject: doc._id, school: doc.school },
        {
          $set: {
            teacher: doc.teacher || null,
            class: doc.class,
            subject: doc._id,
            school: doc.school,
          },
        },
        { upsert: true, new: true }
      );
      upserted += 1;
    }

    if (upserted > 0) {
      console.log(`[migrateClassSubjects] Synced ${upserted} legacy subject→class assignments into ClassSubject.`);
    }

    const classesRaw = await Class.collection
      .find({ 'subjects.0': { $exists: true } })
      .project({ subjects: 1, school: 1 })
      .toArray();

    let fromClassArray = 0;
    for (const c of classesRaw) {
      for (const sid of c.subjects || []) {
        if (!sid) continue;
        const sub = await Subject.findById(sid).select('school').lean();
        if (!sub) continue;
        await ClassSubject.findOneAndUpdate(
          { class: c._id, subject: sid, school: sub.school || c.school },
          {
            $setOnInsert: {
              class: c._id,
              subject: sid,
              school: sub.school || c.school,
              teacher: null,
            },
          },
          { upsert: true }
        );
        fromClassArray += 1;
      }
    }
    if (fromClassArray > 0) {
      console.log(`[migrateClassSubjects] Ensured ${fromClassArray} links from legacy Class.subjects arrays.`);
    }
  } catch (err) {
    console.error('[migrateClassSubjects] Migration error:', err.message);
  }
}
