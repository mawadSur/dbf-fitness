export type Coach = {
  coachId: string;
  fullName: string;
  bio: string | null;
  specialties: string[];
  acceptingMembers: boolean;
  memberCount: number;
};

export type MyCoach = Omit<Coach, 'memberCount'>;

export type CoachProfile = {
  coachId: string;
  bio: string;
  specialties: string[];
  acceptingMembers: boolean;
};

export type CoachProfileInput = {
  bio: string;
  specialties: string[];
  acceptingMembers: boolean;
};

export type ChooseCoachErrorCode =
  | 'coach_not_found'
  | 'coach_not_accepting'
  | 'not_a_member'
  | 'not_authenticated'
  | 'network'
  | 'unknown';

export type CoachProfileFieldErrors = {
  bio?: string;
  specialties?: string;
};
