// Hand-written to match supabase/migrations. Once the Supabase CLI is wired up
// you can regenerate this exactly with:  npm run db:types
// (which runs `supabase gen types typescript --local`).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          notification_prefs: { [key: string]: boolean } | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          notification_prefs?: { [key: string]: boolean } | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          user_id: string;
          parcel_id: string | null;
          address_line1: string;
          city: string | null;
          state: string | null;
          zip: string | null;
          year_built: number | null;
          sqft: number | null;
          beds: number | null;
          baths: number | null;
          lot_size_sqft: number | null;
          property_type: string | null;
          purchase_date: string | null;
          ownership_verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          parcel_id?: string | null;
          address_line1: string;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          year_built?: number | null;
          sqft?: number | null;
          beds?: number | null;
          baths?: number | null;
          lot_size_sqft?: number | null;
          property_type?: string | null;
          purchase_date?: string | null;
          ownership_verified?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      system_lifespans: {
        Row: { system_type: string; expected_lifespan_years: number; label: string };
        Insert: { system_type: string; expected_lifespan_years: number; label: string };
        Update: Partial<Database["public"]["Tables"]["system_lifespans"]["Insert"]>;
        Relationships: [];
      };
      home_systems: {
        Row: {
          id: string;
          property_id: string;
          system_type: string;
          material_or_model: string | null;
          install_year: number | null;
          last_serviced: string | null;
          condition_rating: number | null;
          expected_lifespan_years: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          system_type: string;
          material_or_model?: string | null;
          install_year?: number | null;
          last_serviced?: string | null;
          condition_rating?: number | null;
          expected_lifespan_years?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["home_systems"]["Insert"]>;
        Relationships: [];
      };
      maintenance_tasks: {
        Row: {
          id: string;
          property_id: string;
          system_id: string | null;
          title: string;
          due_date: string | null;
          recurrence: string;
          status: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          system_id?: string | null;
          title: string;
          due_date?: string | null;
          recurrence?: string;
          status?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["maintenance_tasks"]["Insert"]>;
        Relationships: [];
      };
      issues: {
        Row: {
          id: string;
          property_id: string;
          system_id: string | null;
          category: string;
          severity: string;
          description: string | null;
          status: string;
          converted_to_lead: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          system_id?: string | null;
          category: string;
          severity: string;
          description?: string | null;
          status?: string;
          converted_to_lead?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["issues"]["Insert"]>;
        Relationships: [];
      };
      photos: {
        Row: {
          id: string;
          property_id: string;
          related_type: string;
          related_id: string;
          url: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          related_type: string;
          related_id: string;
          url: string;
          uploaded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["photos"]["Insert"]>;
        Relationships: [];
      };
      improvements: {
        Row: {
          id: string;
          property_id: string;
          system_id: string | null;
          improvement_type: string;
          description: string | null;
          completed_date: string | null;
          cost: number | null;
          permit_id: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          system_id?: string | null;
          improvement_type: string;
          description?: string | null;
          completed_date?: string | null;
          cost?: number | null;
          permit_id?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["improvements"]["Insert"]>;
        Relationships: [];
      };
      contractors: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          license_number: string | null;
          categories: string[] | null;
          service_area: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          vetted: boolean;
          rating: number | null;
          review_count: number;
          balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          license_number?: string | null;
          categories?: string[] | null;
          service_area?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          vetted?: boolean;
          rating?: number | null;
          review_count?: number;
          balance?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contractors"]["Insert"]>;
        Relationships: [];
      };
      wallet_config: {
        Row: {
          id: number;
          min_bonus_deposit_cents: number;
          bonus_expiry_days: number;
          spend_cash_first: boolean;
        };
        Insert: {
          id?: number;
          min_bonus_deposit_cents?: number;
          bonus_expiry_days?: number;
          spend_cash_first?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["wallet_config"]["Insert"]
        >;
        Relationships: [];
      };
      deposit_tiers: {
        Row: {
          id: string;
          min_cents: number;
          max_cents: number | null;
          bonus_pct: number;
        };
        Insert: {
          id?: string;
          min_cents: number;
          max_cents?: number | null;
          bonus_pct: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["deposit_tiers"]["Insert"]
        >;
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          contractor_id: string;
          cash_balance_cents: number;
          bonus_balance_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contractor_id: string;
          cash_balance_cents?: number;
          bonus_balance_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wallets"]["Insert"]>;
        Relationships: [];
      };
      bonus_grants: {
        Row: {
          id: string;
          wallet_id: string;
          amount_cents: number;
          remaining_cents: number;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          amount_cents: number;
          remaining_cents: number;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["bonus_grants"]["Insert"]
        >;
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          type: string;
          cash_delta_cents: number;
          bonus_delta_cents: number;
          cash_balance_after_cents: number;
          bonus_balance_after_cents: number;
          lead_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          type: string;
          cash_delta_cents?: number;
          bonus_delta_cents?: number;
          cash_balance_after_cents: number;
          bonus_balance_after_cents: number;
          lead_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wallet_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          lead_id: string;
          user_id: string | null;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          lead_id: string;
          user_id?: string | null;
          emoji: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["message_reactions"]["Insert"]
        >;
        Relationships: [];
      };
      lead_reads: {
        Row: {
          id: string;
          lead_id: string;
          role: string;
          read_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          role: string;
          read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_reads"]["Insert"]>;
        Relationships: [];
      };
      contractor_leads: {
        Row: {
          id: string;
          property_id: string;
          issue_id: string | null;
          contractor_id: string | null;
          category: string;
          status: string;
          payout_amount: number | null;
          homeowner_name: string | null;
          homeowner_email: string | null;
          homeowner_phone: string | null;
          property_address: string | null;
          issue_description: string | null;
          issue_severity: string | null;
          timing: string | null;
          paid: boolean;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          issue_id?: string | null;
          contractor_id?: string | null;
          category: string;
          status?: string;
          payout_amount?: number | null;
          homeowner_name?: string | null;
          homeowner_email?: string | null;
          homeowner_phone?: string | null;
          property_address?: string | null;
          issue_description?: string | null;
          issue_severity?: string | null;
          timing?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contractor_leads"]["Insert"]>;
        Relationships: [];
      };
      intent_signals: {
        Row: {
          id: string;
          property_id: string;
          signal_type: string;
          value: string | null;
          shared_consent: boolean;
          captured_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          signal_type: string;
          value?: string | null;
          shared_consent?: boolean;
          captured_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["intent_signals"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          property_id: string;
          doc_type: string | null;
          file_url: string;
          title: string | null;
          brand: string | null;
          model: string | null;
          install_year: number | null;
          warranty_expires: string | null;
          system_type: string | null;
          summary: string | null;
          applied_at: string | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          doc_type?: string | null;
          file_url: string;
          title?: string | null;
          brand?: string | null;
          model?: string | null;
          install_year?: number | null;
          warranty_expires?: string | null;
          system_type?: string | null;
          summary?: string | null;
          applied_at?: string | null;
          uploaded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          title: string;
          body: string | null;
          url: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          title: string;
          body?: string | null;
          url?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          user_id: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          message: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          message: string;
          status?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["support_messages"]["Insert"]
        >;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          lead_id: string;
          sender_role: string;
          sender_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          sender_role: string;
          sender_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          lead_id: string;
          contractor_id: string;
          property_id: string | null;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          contractor_id: string;
          property_id?: string | null;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          lead_id: string;
          reporter_id: string | null;
          reporter_role: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          reporter_id?: string | null;
          reporter_role: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: string;
          plan: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string;
          plan?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      lead_previews: {
        Row: {
          id: string;
          category: string;
          severity: string | null;
          lead_fee: number | null;
          area: string | null;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      owns_property: {
        Args: { p_property_id: string };
        Returns: boolean;
      };
      can_access_lead: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
      leave_review: {
        Args: { p_lead: string; p_rating: number; p_comment: string };
        Returns: undefined;
      };
      contractor_reviews: {
        Args: { p_contractor: string };
        Returns: {
          rating: number;
          comment: string | null;
          created_at: string;
        }[];
      };
      get_or_create_wallet: {
        Args: { p_contractor: string };
        Returns: string;
      };
      bonus_for_deposit: {
        Args: { p_deposit_cents: number };
        Returns: number;
      };
      apply_deposit: {
        Args: { p_contractor: string; p_deposit_cents: number };
        Returns: undefined;
      };
      charge_lead: {
        Args: { p_lead: string };
        Returns: boolean;
      };
      expire_bonus: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row aliases used across the app.
type T = Database["public"]["Tables"];
export type UserProfile = T["users"]["Row"];
export type Property = T["properties"]["Row"];
export type HomeSystem = T["home_systems"]["Row"];
export type MaintenanceTask = T["maintenance_tasks"]["Row"];
export type Issue = T["issues"]["Row"];
export type Contractor = T["contractors"]["Row"];
export type ContractorLead = T["contractor_leads"]["Row"];
export type SystemLifespan = T["system_lifespans"]["Row"];
export type Subscription = T["subscriptions"]["Row"];
