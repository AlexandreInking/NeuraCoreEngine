export type Vertical = 'Gaming' | 'HR' | 'EdTech' | 'Custom';

export type Vad = { valence: number; arousal: number; dominance: number };

export type AgentProfile = {
  agentId: string;
  tenantId: string;
  personaName: string;
  vertical: Vertical;
  description: string;
  moralAlignment: string;
  baselineVad: Vad;
  emotionalInertiaGamma: number;
  ethicsRules: string[];
  promptBaseText: string;
  updatedAt: number;
};

export type ProfileSnapshot = {
  id: string;
  agentId: string;
  profile: AgentProfile;
  capturedAt: number;
  reason: string;
};

export const MAX_PROFILE_SNAPSHOTS = 5;

export const VERTICALS: Vertical[] = ['Gaming', 'HR', 'EdTech', 'Custom'];
