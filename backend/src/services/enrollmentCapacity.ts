import { Student, SystemSetting } from '../models/index.js';

const GLOBAL_SETTINGS_ID = 'global';
const DEFAULT_ENROLLMENT_LIMIT = 100;

export async function getEnrollmentSettings() {
  const existing = await SystemSetting.findById(GLOBAL_SETTINGS_ID).lean();
  if (existing) return existing;

  const submittedEnrollments = await Student.countDocuments();
  try {
    const settings = await SystemSetting.findOneAndUpdate(
      { _id: GLOBAL_SETTINGS_ID },
      {
        $setOnInsert: {
          enrollmentLimit: DEFAULT_ENROLLMENT_LIMIT,
          submittedEnrollments
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    if (!settings) throw new Error('Não foi possível carregar as configurações de inscrição.');
    return settings;
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) throw error;
    const settings = await SystemSetting.findById(GLOBAL_SETTINGS_ID).lean();
    if (!settings) throw new Error('As configurações de inscrição não foram criadas.');
    return settings;
  }
}

export async function reserveEnrollmentSlot() {
  await getEnrollmentSettings();
  return SystemSetting.findOneAndUpdate(
    {
      _id: GLOBAL_SETTINGS_ID,
      $expr: { $lt: ['$submittedEnrollments', '$enrollmentLimit'] }
    },
    { $inc: { submittedEnrollments: 1 } },
    { new: true }
  ).lean();
}

export async function releaseEnrollmentSlot() {
  const result = await SystemSetting.updateOne(
    { _id: GLOBAL_SETTINGS_ID, submittedEnrollments: { $gt: 0 } },
    { $inc: { submittedEnrollments: -1 } }
  );
  if (result.modifiedCount !== 1) {
    throw new Error('Não foi possível liberar a vaga reservada para a inscrição.');
  }
}
