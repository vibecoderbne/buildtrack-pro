// ─── Domain enums ─────────────────────────────────────────────────────────────

export type UserRole = 'consultant' | 'builder' | 'subcontractor' | 'homeowner'
export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'complete'
export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
export type DelayCause =
  | 'weather'
  | 'client_variation'
  | 'site_conditions'
  | 'subcontractor'
  | 'material_supply'
  | 'authority_approval'
  | 'other'
export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'paid'
export type ContractType = 'fixed_price' | 'cost_plus' | 'hia_standard'

// ─── Database type (matches Supabase-generated format) ────────────────────────
// Structure mirrors `supabase gen types typescript` output so createClient<Database> works.

export type Database = {
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string
          name: string
          abn: string | null
          address: string | null
          logo_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          abn?: string | null
          address?: string | null
          logo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          abn?: string | null
          address?: string | null
          logo_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          organisation_id: string | null
          email: string
          full_name: string
          phone: string | null
          role: UserRole
          trade: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          organisation_id?: string | null
          email: string
          full_name: string
          phone?: string | null
          role?: UserRole
          trade?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          organisation_id?: string | null
          email?: string
          full_name?: string
          phone?: string | null
          role?: UserRole
          trade?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          organisation_id: string
          name: string
          address: string
          status: ProjectStatus
          start_date: string
          target_completion: string | null
          current_completion: string | null
          homeowner_id: string | null
          builder_id: string
          created_by: string
          created_at: string
          updated_at: string
          setup_completed: boolean
          baseline_locked_at: string | null
          baseline_locked_by: string | null
        }
        Insert: {
          id?: string
          organisation_id: string
          name: string
          address: string
          status?: ProjectStatus
          start_date: string
          target_completion?: string | null
          current_completion?: string | null
          homeowner_id?: string | null
          builder_id: string
          created_by: string
          created_at?: string
          updated_at?: string
          setup_completed?: boolean
          baseline_locked_at?: string | null
          baseline_locked_by?: string | null
        }
        Update: {
          id?: string
          organisation_id?: string
          name?: string
          address?: string
          status?: ProjectStatus
          start_date?: string
          target_completion?: string | null
          current_completion?: string | null
          homeowner_id?: string | null
          builder_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          setup_completed?: boolean
          baseline_locked_at?: string | null
          baseline_locked_by?: string | null
        }
        Relationships: []
      }
      phases: {
        Row: {
          id: string
          project_id: string
          name: string
          sort_order: number
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          sort_order?: number
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          sort_order?: number
          color?: string
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          phase_id: string
          project_id: string
          name: string
          sort_order: number
          planned_start: string | null
          planned_end: string | null
          actual_start: string | null
          actual_end: string | null
          current_start: string | null
          current_end: string | null
          duration_days: number
          progress_pct: number
          depends_on: string[]
          trade: string | null
          contract_value: number
          is_milestone: boolean
          notes: string | null
          days_delayed: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          phase_id: string
          project_id: string
          name: string
          sort_order?: number
          planned_start?: string | null
          planned_end?: string | null
          actual_start?: string | null
          actual_end?: string | null
          current_start?: string | null
          current_end?: string | null
          duration_days?: number
          progress_pct?: number
          depends_on?: string[]
          trade?: string | null
          contract_value?: number
          is_milestone?: boolean
          notes?: string | null
          days_delayed?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          phase_id?: string
          project_id?: string
          name?: string
          sort_order?: number
          planned_start?: string | null
          planned_end?: string | null
          actual_start?: string | null
          actual_end?: string | null
          current_start?: string | null
          current_end?: string | null
          duration_days?: number
          progress_pct?: number
          depends_on?: string[]
          trade?: string | null
          contract_value?: number
          is_milestone?: boolean
          notes?: string | null
          days_delayed?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_dependencies: {
        Row: {
          id: string
          task_id: string
          depends_on_task_id: string
          dependency_type: DependencyType
          lag_days: number
        }
        Insert: {
          id?: string
          task_id: string
          depends_on_task_id: string
          dependency_type?: DependencyType
          lag_days?: number
        }
        Update: {
          id?: string
          task_id?: string
          depends_on_task_id?: string
          dependency_type?: DependencyType
          lag_days?: number
        }
        Relationships: []
      }
      task_progress_logs: {
        Row: {
          id: string
          task_id: string
          progress_pct: number
          previous_pct: number
          updated_by: string
          note: string | null
          logged_at: string
        }
        Insert: {
          id?: string
          task_id: string
          progress_pct: number
          previous_pct: number
          updated_by: string
          note?: string | null
          logged_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          progress_pct?: number
          previous_pct?: number
          updated_by?: string
          note?: string | null
          logged_at?: string
        }
        Relationships: []
      }
      task_photos: {
        Row: {
          id: string
          task_id: string
          uploaded_by: string
          storage_path: string
          thumbnail_path: string | null
          caption: string | null
          is_visible_to_homeowner: boolean
          uploaded_at: string
        }
        Insert: {
          id?: string
          task_id: string
          uploaded_by: string
          storage_path: string
          thumbnail_path?: string | null
          caption?: string | null
          is_visible_to_homeowner?: boolean
          uploaded_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          uploaded_by?: string
          storage_path?: string
          thumbnail_path?: string | null
          caption?: string | null
          is_visible_to_homeowner?: boolean
          uploaded_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          project_id: string
          contract_sum: number
          current_contract_sum: number
          retention_pct: number
          retention_cap: number | null
          defects_liability_months: number
          payment_terms_days: number
          contract_type: ContractType
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          contract_sum: number
          current_contract_sum: number
          retention_pct?: number
          retention_cap?: number | null
          defects_liability_months?: number
          payment_terms_days?: number
          contract_type?: ContractType
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          contract_sum?: number
          current_contract_sum?: number
          retention_pct?: number
          retention_cap?: number | null
          defects_liability_months?: number
          payment_terms_days?: number
          contract_type?: ContractType
          created_at?: string
        }
        Relationships: []
      }
      delays: {
        Row: {
          id: string
          project_id: string
          cause: DelayCause
          description: string
          delay_days: number
          date_from: string
          date_to: string | null
          is_excusable: boolean
          supporting_evidence: string | null
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          cause: DelayCause
          description: string
          delay_days: number
          date_from: string
          date_to?: string | null
          is_excusable?: boolean
          supporting_evidence?: string | null
          recorded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          cause?: DelayCause
          description?: string
          delay_days?: number
          date_from?: string
          date_to?: string | null
          is_excusable?: boolean
          supporting_evidence?: string | null
          recorded_by?: string
          created_at?: string
        }
        Relationships: []
      }
      delay_affected_tasks: {
        Row: {
          id: string
          delay_id: string
          task_id: string
          days_impact: number
        }
        Insert: {
          id?: string
          delay_id: string
          task_id: string
          days_impact: number
        }
        Update: {
          id?: string
          delay_id?: string
          task_id?: string
          days_impact?: number
        }
        Relationships: []
      }
      payment_claims: {
        Row: {
          id: string
          project_id: string
          claim_number: number
          claim_period_start: string
          claim_period_end: string
          status: ClaimStatus
          gross_claim_amount: number
          less_previous_claims: number
          this_claim_amount: number
          less_retention: number
          net_claim_amount: number
          generated_by: string
          submitted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          claim_number: number
          claim_period_start: string
          claim_period_end: string
          status?: ClaimStatus
          gross_claim_amount?: number
          less_previous_claims?: number
          this_claim_amount?: number
          less_retention?: number
          net_claim_amount?: number
          generated_by: string
          submitted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          claim_number?: number
          claim_period_start?: string
          claim_period_end?: string
          status?: ClaimStatus
          gross_claim_amount?: number
          less_previous_claims?: number
          this_claim_amount?: number
          less_retention?: number
          net_claim_amount?: number
          generated_by?: string
          submitted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      claim_line_items: {
        Row: {
          id: string
          claim_id: string
          task_id: string
          contract_value: number
          progress_pct_current: number
          progress_pct_previous: number
          value_to_date: number
          value_previous: number
          this_claim_value: number
        }
        Insert: {
          id?: string
          claim_id: string
          task_id: string
          contract_value: number
          progress_pct_current: number
          progress_pct_previous: number
          value_to_date: number
          value_previous: number
          this_claim_value: number
        }
        Update: {
          id?: string
          claim_id?: string
          task_id?: string
          contract_value?: number
          progress_pct_current?: number
          progress_pct_previous?: number
          value_to_date?: number
          value_previous?: number
          this_claim_value?: number
        }
        Relationships: []
      }
      homeowner_updates: {
        Row: {
          id: string
          project_id: string
          title: string
          body: string
          is_published: boolean
          photos: string[]
          milestones_reached: string[]
          created_by: string
          published_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          title: string
          body: string
          is_published?: boolean
          photos?: string[]
          milestones_reached?: string[]
          created_by: string
          published_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          title?: string
          body?: string
          is_published?: boolean
          photos?: string[]
          milestones_reached?: string[]
          created_by?: string
          published_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      task_baselines: {
        Row: {
          id: string
          task_id: string
          project_id: string
          original_start_date: string
          original_end_date: string
          original_duration: number
          original_contract_price: number
          locked_at: string
          locked_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          project_id: string
          original_start_date: string
          original_end_date: string
          original_duration: number
          original_contract_price?: number
          locked_at?: string
          locked_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          project_id?: string
          original_start_date?: string
          original_end_date?: string
          original_duration?: number
          original_contract_price?: number
          locked_at?: string
          locked_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      task_variations: {
        Row: {
          id: string
          task_id: string
          project_id: string
          field_changed: string
          old_value: string | null
          new_value: string | null
          changed_at: string
          changed_by: string | null
          reason: string | null
        }
        Insert: {
          id?: string
          task_id: string
          project_id: string
          field_changed: string
          old_value?: string | null
          new_value?: string | null
          changed_at?: string
          changed_by?: string | null
          reason?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          project_id?: string
          field_changed?: string
          old_value?: string | null
          new_value?: string | null
          changed_at?: string
          changed_by?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      templates: {
        Row: {
          id: string
          organisation_id: string
          name: string
          description: string | null
          phases_data: unknown
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organisation_id: string
          name: string
          description?: string | null
          phases_data?: unknown
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          organisation_id?: string
          name?: string
          description?: string | null
          phases_data?: unknown
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      lock_project_baseline: {
        Args: { p_project_id: string }
        Returns: void
      }
    }
    Enums: {
      user_role: UserRole
      project_status: ProjectStatus
      dependency_type: DependencyType
      delay_cause: DelayCause
      claim_status: ClaimStatus
      contract_type: ContractType
    }
  }
}

// ─── Convenience row types ────────────────────────────────────────────────────

export type Organisation = Database['public']['Tables']['organisations']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Phase = Database['public']['Tables']['phases']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type TaskDependency = Database['public']['Tables']['task_dependencies']['Row']
export type TaskProgressLog = Database['public']['Tables']['task_progress_logs']['Row']
export type TaskPhoto = Database['public']['Tables']['task_photos']['Row']
export type Contract = Database['public']['Tables']['contracts']['Row']
export type Delay = Database['public']['Tables']['delays']['Row']
export type DelayAffectedTask = Database['public']['Tables']['delay_affected_tasks']['Row']
export type PaymentClaim = Database['public']['Tables']['payment_claims']['Row']
export type ClaimLineItem = Database['public']['Tables']['claim_line_items']['Row']
export type HomeownerUpdate = Database['public']['Tables']['homeowner_updates']['Row']
export type Template = Database['public']['Tables']['templates']['Row']
export type TaskBaseline = Database['public']['Tables']['task_baselines']['Row']
export type TaskVariation = Database['public']['Tables']['task_variations']['Row']
