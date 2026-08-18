import mongoose, { Schema, Document } from 'mongoose';

interface AudioMeta {
  filename: string;
  last_update: string;
}

interface LanguageSection {
  translation: string;
  note: string;
  use_exemple?: string;
  port_exemple?: string;
  last_update?: string;
  translation_audio?: AudioMeta;
  use_exemple_audio?: AudioMeta;
  port_exemple_audio?: AudioMeta;
}

export interface IChallenge {
  _id: string;
  id?: string;  // alias populated at runtime by challengeCache
  type: 'word' | 'verb' | 'idiom';
  port: string;
  fr: LanguageSection;
  en: LanguageSection;
  user_usefulness?: number;
  // verb-only: present tense conjugations [eu, tu, ele, nós, vós, eles]
  present?: string[];
  audio?: AudioMeta;
  schemaVersion: number;
}

const AudioMetaSchema = new Schema<AudioMeta>(
  { filename: String, last_update: String },
  { _id: false }
);

const LanguageSectionSchema = new Schema<LanguageSection>(
  {
    translation: String,
    note: String,
    use_exemple: String,
    port_exemple: String,
    last_update: String,
    translation_audio: AudioMetaSchema,
    use_exemple_audio: AudioMetaSchema,
    port_exemple_audio: AudioMetaSchema,
  },
  { _id: false }
);

const ChallengeSchema = new Schema<IChallenge>(
  {
    _id: { type: String },
    type: { type: String, enum: ['word', 'verb', 'idiom'], required: true, index: true },
    port: { type: String, required: true },
    fr: { type: LanguageSectionSchema, required: true },
    en: { type: LanguageSectionSchema, required: true },
    user_usefulness: { type: Number },
    present: [String],
    audio: AudioMetaSchema,
    schemaVersion: { type: Number, required: true, default: 1 },
  },
  { _id: false }
);

export default mongoose.model<IChallenge>('Challenge', ChallengeSchema);
