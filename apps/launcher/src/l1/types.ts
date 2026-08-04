export type L1Fact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  certainty: number; // 0..1
  embedding: number[]; // EMBEDDING_DIMENSION
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  sourceEntryId?: string;
  fromModel: boolean;
};

export type L1SearchResult = {
  fact: L1Fact;
  cosine: number;
  score: number; // cosine * exp(-lambda * deltaHours)
  ageHours: number;
};

export type L1Config = {
  lambda: number; // decay aggressiveness (0.01 - 0.5)
  autoExtract: boolean;
  batchSize: number; // N entries per extraction batch
  certaintyThreshold: number;
};

export const DEFAULT_L1_CONFIG: L1Config = {
  lambda: 0.03,
  autoExtract: false,
  batchSize: 5,
  certaintyThreshold: 0.75,
};

export const DEFAULT_LAMBDA = 0.03;
