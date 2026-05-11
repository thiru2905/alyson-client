export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          activity_score: number
          adjusted_hours: number
          adjustment_note: string | null
          approved_hours: number
          created_at: string
          employee_id: string
          id: string
          source_hours: number
          work_date: string
        }
        Insert: {
          activity_score?: number
          adjusted_hours?: number
          adjustment_note?: string | null
          approved_hours?: number
          created_at?: string
          employee_id: string
          id?: string
          source_hours?: number
          work_date: string
        }
        Update: {
          activity_score?: number
          adjusted_hours?: number
          adjustment_note?: string | null
          approved_hours?: number
          created_at?: string
          employee_id?: string
          id?: string
          source_hours?: number
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bonus_awards: {
        Row: {
          created_at: string
          cycle_period: string
          employee_id: string
          final_amount: number | null
          id: string
          notes: string | null
          plan_id: string
          predicted_amount: number
          status: Database["public"]["Enums"]["bonus_status"]
        }
        Insert: {
          created_at?: string
          cycle_period: string
          employee_id: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          plan_id: string
          predicted_amount?: number
          status?: Database["public"]["Enums"]["bonus_status"]
        }
        Update: {
          created_at?: string
          cycle_period?: string
          employee_id?: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          plan_id?: string
          predicted_amount?: number
          status?: Database["public"]["Enums"]["bonus_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bonus_awards_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_awards_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "bonus_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_plans: {
        Row: {
          active: boolean
          bonus_type: Database["public"]["Enums"]["bonus_type"]
          created_at: string
          cycle: string
          description: string | null
          formula: string | null
          id: string
          name: string
          pool_amount: number | null
        }
        Insert: {
          active?: boolean
          bonus_type: Database["public"]["Enums"]["bonus_type"]
          created_at?: string
          cycle?: string
          description?: string | null
          formula?: string | null
          id?: string
          name: string
          pool_amount?: number | null
        }
        Update: {
          active?: boolean
          bonus_type?: Database["public"]["Enums"]["bonus_type"]
          created_at?: string
          cycle?: string
          description?: string | null
          formula?: string | null
          id?: string
          name?: string
          pool_amount?: number | null
        }
        Relationships: []
      }
      compensation: {
        Row: {
          base_salary: number
          benefits: number
          bonus_pct: number
          created_at: string
          effective_date: string
          employee_id: string
          equity_grant: number
          id: string
        }
        Insert: {
          base_salary: number
          benefits?: number
          bonus_pct?: number
          created_at?: string
          effective_date?: string
          employee_id: string
          equity_grant?: number
          id?: string
        }
        Update: {
          base_salary?: number
          benefits?: number
          bonus_pct?: number
          created_at?: string
          effective_date?: string
          employee_id?: string
          equity_grant?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_links: {
        Row: {
          document_id: string
          id: string
          linked_id: string
          linked_type: string
        }
        Insert: {
          document_id: string
          id?: string
          linked_id: string
          linked_type: string
        }
        Update: {
          document_id?: string
          id?: string
          linked_id?: string
          linked_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string
          expires_at: string | null
          file_url: string | null
          id: string
          tags: string[]
          title: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          tags?: string[]
          title: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          tags?: string[]
          title?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          avatar_url: string | null
          country: string
          created_at: string
          currency: string
          department_id: string
          dotted_manager_id: string | null
          email: string
          employee_type: string
          full_name: string
          hire_date: string
          id: string
          level: string
          manager_id: string | null
          performance_score: number
          role: string
          termination_date: string | null
        }
        Insert: {
          avatar_url?: string | null
          country?: string
          created_at?: string
          currency?: string
          department_id: string
          dotted_manager_id?: string | null
          email: string
          employee_type?: string
          full_name: string
          hire_date: string
          id?: string
          level: string
          manager_id?: string | null
          performance_score?: number
          role: string
          termination_date?: string | null
        }
        Update: {
          avatar_url?: string | null
          country?: string
          created_at?: string
          currency?: string
          department_id?: string
          dotted_manager_id?: string | null
          email?: string
          employee_type?: string
          full_name?: string
          hire_date?: string
          id?: string
          level?: string
          manager_id?: string | null
          performance_score?: number
          role?: string
          termination_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_dotted_manager_id_fkey"
            columns: ["dotted_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      equity_grants: {
        Row: {
          board_approved: boolean
          certificate_id: string | null
          cliff_months: number
          created_at: string
          grant_date: string
          holder_id: string
          id: string
          security_type: Database["public"]["Enums"]["security_type"]
          strike_price: number
          total_shares: number
          vesting_frequency: string
          vesting_start: string
          vesting_years: number
        }
        Insert: {
          board_approved?: boolean
          certificate_id?: string | null
          cliff_months?: number
          created_at?: string
          grant_date: string
          holder_id: string
          id?: string
          security_type: Database["public"]["Enums"]["security_type"]
          strike_price?: number
          total_shares: number
          vesting_frequency?: string
          vesting_start: string
          vesting_years?: number
        }
        Update: {
          board_approved?: boolean
          certificate_id?: string | null
          cliff_months?: number
          created_at?: string
          grant_date?: string
          holder_id?: string
          id?: string
          security_type?: Database["public"]["Enums"]["security_type"]
          strike_price?: number
          total_shares?: number
          vesting_frequency?: string
          vesting_start?: string
          vesting_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "equity_grants_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "equity_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      equity_holders: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          employee_id: string | null
          entity_name: string | null
          holder_type: Database["public"]["Enums"]["holder_type"]
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          employee_id?: string | null
          entity_name?: string | null
          holder_type: Database["public"]["Enums"]["holder_type"]
          id?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          employee_id?: string | null
          entity_name?: string | null
          holder_type?: Database["public"]["Enums"]["holder_type"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_holders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          category: string
          created_at: string
          description: string
          expression: string
          id: string
          inputs: Json
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          expression: string
          id?: string
          inputs: Json
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          expression?: string
          id?: string
          inputs?: Json
          name?: string
        }
        Relationships: []
      }
      kpi_definitions: {
        Row: {
          category: string
          created_at: string
          downstream: string[]
          formula: string
          id: string
          name: string
          plain_english: string
          source_tables: string[]
        }
        Insert: {
          category: string
          created_at?: string
          downstream?: string[]
          formula: string
          id?: string
          name: string
          plain_english: string
          source_tables?: string[]
        }
        Update: {
          category?: string
          created_at?: string
          downstream?: string[]
          formula?: string
          id?: string
          name?: string
          plain_english?: string
          source_tables?: string[]
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          employee_id: string
          entitled: number
          id: string
          leave_type_id: string
          remaining: number
          taken: number
          year: number
        }
        Insert: {
          employee_id: string
          entitled?: number
          id?: string
          leave_type_id: string
          remaining?: number
          taken?: number
          year: number
        }
        Update: {
          employee_id?: string
          entitled?: number
          id?: string
          leave_type_id?: string
          remaining?: number
          taken?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          active: boolean
          annual_days: number
          country: string | null
          created_at: string
          employee_type: string | null
          id: string
          leave_type_id: string
          name: string
          rollover_days: number
        }
        Insert: {
          active?: boolean
          annual_days?: number
          country?: string | null
          created_at?: string
          employee_type?: string | null
          id?: string
          leave_type_id: string
          name: string
          rollover_days?: number
        }
        Update: {
          active?: boolean
          annual_days?: number
          country?: string | null
          created_at?: string
          employee_type?: string | null
          id?: string
          leave_type_id?: string
          name?: string
          rollover_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_policies_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approver_id: string | null
          created_at: string
          days: number
          decided_at: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          days: number
          decided_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          color: string
          id: string
          name: string
          paid: boolean
          requires_doc: boolean
        }
        Insert: {
          code: string
          color?: string
          id?: string
          name: string
          paid?: boolean
          requires_doc?: boolean
        }
        Update: {
          code?: string
          color?: string
          id?: string
          name?: string
          paid?: boolean
          requires_doc?: boolean
        }
        Relationships: []
      }
      metrics_history: {
        Row: {
          avg_performance: number
          created_at: string
          headcount: number
          id: string
          period: string
          total_bonus: number
          total_compensation: number
        }
        Insert: {
          avg_performance: number
          created_at?: string
          headcount: number
          id?: string
          period: string
          total_bonus: number
          total_compensation: number
        }
        Update: {
          avg_performance?: number
          created_at?: string
          headcount?: number
          id?: string
          period?: string
          total_bonus?: number
          total_compensation?: number
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          amount: number
          created_at: string
          currency: string
          employee_id: string
          id: string
          item_type: Database["public"]["Enums"]["payroll_item_type"]
          override_note: string | null
          override_reason: string | null
          payroll_run_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          employee_id: string
          id?: string
          item_type: Database["public"]["Enums"]["payroll_item_type"]
          override_note?: string | null
          override_reason?: string | null
          payroll_run_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          employee_id?: string
          id?: string
          item_type?: Database["public"]["Enums"]["payroll_item_type"]
          override_note?: string | null
          override_reason?: string | null
          payroll_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period: string
          status: Database["public"]["Enums"]["payroll_status"]
          total_amount: number
          total_employees: number
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_amount?: number
          total_employees?: number
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_amount?: number
          total_employees?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          employee_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          bonus_recommendation: number | null
          comments: string | null
          created_at: string
          cycle_id: string
          employee_id: string
          equity_recommendation: number | null
          id: string
          multiplier: number
          promotion_ready: boolean
          rating: number
          reviewer_id: string | null
          status: string
        }
        Insert: {
          bonus_recommendation?: number | null
          comments?: string | null
          created_at?: string
          cycle_id: string
          employee_id: string
          equity_recommendation?: number | null
          id?: string
          multiplier?: number
          promotion_ready?: boolean
          rating?: number
          reviewer_id?: string | null
          status?: string
        }
        Update: {
          bonus_recommendation?: number | null
          comments?: string | null
          created_at?: string
          cycle_id?: string
          employee_id?: string
          equity_recommendation?: number | null
          id?: string
          multiplier?: number
          promotion_ready?: boolean
          rating?: number
          reviewer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vesting_events: {
        Row: {
          created_at: string
          cumulative_vested: number
          grant_id: string
          id: string
          shares_vested: number
          vest_date: string
        }
        Insert: {
          created_at?: string
          cumulative_vested: number
          grant_id: string
          id?: string
          shares_vested: number
          vest_date: string
        }
        Update: {
          created_at?: string
          cumulative_vested?: number
          grant_id?: string
          id?: string
          shares_vested?: number
          vest_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vesting_events_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "equity_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          created_at: string
          current_step: number
          due_at: string | null
          id: string
          initiated_by: string | null
          module: string
          reference_id: string | null
          status: Database["public"]["Enums"]["wf_status"]
          subject: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          current_step?: number
          due_at?: string | null
          id?: string
          initiated_by?: string | null
          module: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["wf_status"]
          subject: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          current_step?: number
          due_at?: string | null
          id?: string
          initiated_by?: string | null
          module?: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["wf_status"]
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"] | null
          approver_user: string | null
          comment: string | null
          decided_at: string | null
          id: string
          instance_id: string
          status: Database["public"]["Enums"]["wf_status"]
          step_index: number
        }
        Insert: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user?: string | null
          comment?: string | null
          decided_at?: string | null
          id?: string
          instance_id: string
          status?: Database["public"]["Enums"]["wf_status"]
          step_index: number
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user?: string | null
          comment?: string | null
          decided_at?: string | null
          id?: string
          instance_id?: string
          status?: Database["public"]["Enums"]["wf_status"]
          step_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          module: string
          name: string
          steps: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          module: string
          name: string
          steps?: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          module?: string
          name?: string
          steps?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "ceo"
        | "finance"
        | "hr"
        | "manager"
        | "employee"
      bonus_status:
        | "draft"
        | "simulated"
        | "manager_approved"
        | "finance_approved"
        | "paid"
      bonus_type:
        | "fixed"
        | "discretionary"
        | "team_pool"
        | "target"
        | "review_score"
        | "formula"
      holder_type: "employee" | "founder" | "investor" | "advisor" | "entity"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      payroll_item_type:
        | "base"
        | "overtime"
        | "reimbursement"
        | "spot_bonus"
        | "quarterly_bonus"
        | "annual_bonus"
        | "equity_payout"
        | "adjustment"
        | "deduction"
      payroll_status:
        | "draft"
        | "manager_review"
        | "finance_review"
        | "approved"
        | "paid"
      security_type:
        | "options"
        | "rsu"
        | "common_share"
        | "preferred_share"
        | "warrant"
      wf_status: "pending" | "approved" | "rejected" | "cancelled" | "overdue"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "ceo", "finance", "hr", "manager", "employee"],
      bonus_status: [
        "draft",
        "simulated",
        "manager_approved",
        "finance_approved",
        "paid",
      ],
      bonus_type: [
        "fixed",
        "discretionary",
        "team_pool",
        "target",
        "review_score",
        "formula",
      ],
      holder_type: ["employee", "founder", "investor", "advisor", "entity"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      payroll_item_type: [
        "base",
        "overtime",
        "reimbursement",
        "spot_bonus",
        "quarterly_bonus",
        "annual_bonus",
        "equity_payout",
        "adjustment",
        "deduction",
      ],
      payroll_status: [
        "draft",
        "manager_review",
        "finance_review",
        "approved",
        "paid",
      ],
      security_type: [
        "options",
        "rsu",
        "common_share",
        "preferred_share",
        "warrant",
      ],
      wf_status: ["pending", "approved", "rejected", "cancelled", "overdue"],
    },
  },
} as const
