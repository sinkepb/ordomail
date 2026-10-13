import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ContexteSecureData {
  req: Request;
  sb: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  jwtSecret: string;
  pharmacieId: string | null;
  vendeurSub: string | null;
  callerUserId: string | null;
  callerJti: string | null;
  callerExp: number | null;
  resource: string;
  params: any;
  CORS: Record<string, string>;
}
