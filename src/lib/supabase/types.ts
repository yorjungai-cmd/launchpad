/**
 * Supabase Database type definitions.
 *
 * This file is a placeholder — in production, generate this with:
 *   pnpm supabase:types
 *
 * The generated types will reflect the actual database schema including
 * all tables, views, functions, and enums.
 */

// ─── App Role Enum ────────────────────────────────────────────────────────────
export type AppRole = "guest" | "internal_submitter" | "bd_reviewer" | "admin";

// ─── idea-submission Enums ────────────────────────────────────────────────────

/** Who submitted the idea */
export type SubmitterType = "employee" | "executive" | "partner" | "vendor";

/** How the idea content was provided */
export type InputType = "text" | "file" | "url";

/** Stage in the Launch PAD 2.0 pipeline (defined in foundation migration) */
export type Stage = "sandbox" | "validation_sprint" | "build_sprint" | "launch_and_test";

/** AI analysis pipeline state */
export type AnalysisStatus = "pending" | "processing" | "analysis_complete" | "failed";

// ─── Database Type ────────────────────────────────────────────────────────────

/**
 * Placeholder Database type — replace with generated output from:
 *   pnpm supabase gen types typescript --local > src/lib/supabase/types.ts
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: AppRole;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: AppRole;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      // ─── ideas table ──────────────────────────────────────────────────────
      ideas: {
        Row: {
          id: string;
          reference_number: string;
          title: string;
          submitter_name: string;
          submitter_email: string;
          submitter_type: SubmitterType;
          user_id: string | null;
          input_type: InputType;
          raw_content: string | null;
          file_url: string | null;
          file_original_name: string | null;
          source_url: string | null;
          extracted_text: string | null;
          current_stage: Stage;
          analysis_status: AnalysisStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference_number: string;
          title: string;
          submitter_name: string;
          submitter_email: string;
          submitter_type: SubmitterType;
          user_id?: string | null;
          input_type: InputType;
          raw_content?: string | null;
          file_url?: string | null;
          file_original_name?: string | null;
          source_url?: string | null;
          extracted_text?: string | null;
          current_stage?: Stage;
          analysis_status?: AnalysisStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reference_number?: string;
          title?: string;
          submitter_name?: string;
          submitter_email?: string;
          submitter_type?: SubmitterType;
          user_id?: string | null;
          input_type?: InputType;
          raw_content?: string | null;
          file_url?: string | null;
          file_original_name?: string | null;
          source_url?: string | null;
          extracted_text?: string | null;
          current_stage?: Stage;
          analysis_status?: AnalysisStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ideas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // ─── api_keys table (admin-ai-config) ────────────────────────────────
      api_keys: {
        Row: {
          id: string;
          name: string;
          provider: string;
          vault_id: string;
          masked_key: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          provider?: string;
          vault_id: string;
          masked_key: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          provider?: string;
          vault_id?: string;
          masked_key?: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      // ─── admin_audit_log table (admin-ai-config) ──────────────────────────
      admin_audit_log: {
        Row: {
          id: string;
          action: string;
          admin_id: string | null;
          target_type: string;
          target_id: string;
          metadata: Record<string, string | number | boolean>;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          admin_id?: string | null;
          target_type: string;
          target_id: string;
          metadata?: Record<string, string | number | boolean>;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          admin_id?: string | null;
          target_type?: string;
          target_id?: string;
          metadata?: Record<string, string | number | boolean>;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };

      // ─── system_settings table (admin-ai-config) ──────────────────────────
      system_settings: {
        Row: {
          id: string;
          ai_config: Record<string, unknown>;
          prompt_config: Record<string, unknown>;
          portfolio_config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ai_config?: Record<string, unknown>;
          prompt_config?: Record<string, unknown>;
          portfolio_config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ai_config?: Record<string, unknown>;
          prompt_config?: Record<string, unknown>;
          portfolio_config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      vault_create_secret: {
        Args: { secret: string; name: string };
        Returns: string;
      };
      vault_update_secret: {
        Args: { id: string; secret: string };
        Returns: void;
      };
      vault_delete_secret: {
        Args: { id: string };
        Returns: void;
      };
      vault_read_secret: {
        Args: { secret_id: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      submitter_type: SubmitterType;
      input_type: InputType;
      stage: Stage;
      analysis_status: AnalysisStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ─── Convenience helpers — profiles ──────────────────────────────────────────

/** Profile row type (read from DB) */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** Profile insert type */
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

/** Profile update type */
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

// ─── Convenience helpers — ideas ─────────────────────────────────────────────

/** Idea row type (read from DB) */
export type Idea = Database["public"]["Tables"]["ideas"]["Row"];

/** Idea insert type */
export type IdeaInsert = Database["public"]["Tables"]["ideas"]["Insert"];

/** Idea update type */
export type IdeaUpdate = Database["public"]["Tables"]["ideas"]["Update"];
