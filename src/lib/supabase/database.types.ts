// GENERATED from the database built by supabase/migrations: do not edit by hand.
// Regenerate after every migration: scripts/types/generate.sh (the Checks job fails when this file is out of date).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          brand_id: string | null;
          changed_at: string;
          changed_by: string | null;
          id: number;
          new_data: Json | null;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          brand_id?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          brand_id?: string | null;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          logo_path: string | null;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          logo_path?: string | null;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          logo_path?: string | null;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brands_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          brand_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "categories_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      company_settings: {
        Row: {
          address: string | null;
          bank_details: string | null;
          billing_max_discount: number;
          doc_prefix: string;
          email: string | null;
          expense_claim_days: number;
          geofence_radius_m: number;
          gps_min_accuracy_m: number;
          gstin: string | null;
          id: number;
          invoice_terms: string | null;
          legal_name: string;
          live_location_minutes: number;
          logo_path: string | null;
          phone: string | null;
          reorder_cover_days: number;
          reorder_lead_days: number;
          salesman_max_discount: number;
          state_code: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          bank_details?: string | null;
          billing_max_discount?: number;
          doc_prefix?: string;
          email?: string | null;
          expense_claim_days?: number;
          geofence_radius_m?: number;
          gps_min_accuracy_m?: number;
          gstin?: string | null;
          id?: number;
          invoice_terms?: string | null;
          legal_name: string;
          live_location_minutes?: number;
          logo_path?: string | null;
          phone?: string | null;
          reorder_cover_days?: number;
          reorder_lead_days?: number;
          salesman_max_discount?: number;
          state_code?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          bank_details?: string | null;
          billing_max_discount?: number;
          doc_prefix?: string;
          email?: string | null;
          expense_claim_days?: number;
          geofence_radius_m?: number;
          gps_min_accuracy_m?: number;
          gstin?: string | null;
          id?: number;
          invoice_terms?: string | null;
          legal_name?: string;
          live_location_minutes?: number;
          logo_path?: string | null;
          phone?: string | null;
          reorder_cover_days?: number;
          reorder_lead_days?: number;
          salesman_max_discount?: number;
          state_code?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_settings_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_note_lines: {
        Row: {
          cgst: number;
          credit_note_id: string;
          id: string;
          igst: number;
          invoice_line_id: string;
          line_total: number;
          qty: number;
          sgst: number;
          taxable_value: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          cgst?: number;
          credit_note_id: string;
          id?: string;
          igst?: number;
          invoice_line_id: string;
          line_total: number;
          qty: number;
          sgst?: number;
          taxable_value: number;
          tenant_id: string;
        };
        Update: {
          cgst?: number;
          credit_note_id?: string;
          id?: string;
          igst?: number;
          invoice_line_id?: string;
          line_total?: number;
          qty?: number;
          sgst?: number;
          taxable_value?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey";
            columns: ["tenant_id", "credit_note_id"];
            isOneToOne: false;
            referencedRelation: "credit_notes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "credit_note_lines_invoice_line_id_fkey";
            columns: ["tenant_id", "invoice_line_id"];
            isOneToOne: false;
            referencedRelation: "invoice_lines";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "credit_note_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_notes: {
        Row: {
          brand_id: string | null;
          cgst_total: number;
          created_at: string;
          created_by: string | null;
          credit_note_no: string;
          fy: string;
          grand_total: number;
          id: string;
          igst_total: number;
          invoice_id: string;
          note_date: string;
          reason: string;
          restock: boolean;
          retailer_id: string;
          sgst_total: number;
          status: Database["public"]["Enums"]["credit_note_status"];
          taxable_total: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id?: string | null;
          cgst_total?: number;
          created_at?: string;
          created_by?: string | null;
          credit_note_no: string;
          fy: string;
          grand_total: number;
          id?: string;
          igst_total?: number;
          invoice_id: string;
          note_date?: string;
          reason: string;
          restock?: boolean;
          retailer_id: string;
          sgst_total?: number;
          status?: Database["public"]["Enums"]["credit_note_status"];
          taxable_total: number;
          tenant_id: string;
        };
        Update: {
          brand_id?: string | null;
          cgst_total?: number;
          created_at?: string;
          created_by?: string | null;
          credit_note_no?: string;
          fy?: string;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          invoice_id?: string;
          note_date?: string;
          reason?: string;
          restock?: boolean;
          retailer_id?: string;
          sgst_total?: number;
          status?: Database["public"]["Enums"]["credit_note_status"];
          taxable_total?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_notes_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "credit_notes_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "credit_notes_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "credit_notes_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatches: {
        Row: {
          created_at: string;
          delivered_at: string | null;
          delivery_confirmed_by: string | null;
          delivery_remarks: string | null;
          dispatch_no: string;
          dispatched_at: string | null;
          dispatched_by: string | null;
          id: string;
          invoice_id: string;
          picked_by: string | null;
          proof_path: string | null;
          status: Database["public"]["Enums"]["dispatch_status"];
          tenant_id: string;
          updated_at: string;
          vehicle_no: string | null;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          delivered_at?: string | null;
          delivery_confirmed_by?: string | null;
          delivery_remarks?: string | null;
          dispatch_no: string;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          id?: string;
          invoice_id: string;
          picked_by?: string | null;
          proof_path?: string | null;
          status?: Database["public"]["Enums"]["dispatch_status"];
          tenant_id: string;
          updated_at?: string;
          vehicle_no?: string | null;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          delivered_at?: string | null;
          delivery_confirmed_by?: string | null;
          delivery_remarks?: string | null;
          dispatch_no?: string;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          id?: string;
          invoice_id?: string;
          picked_by?: string | null;
          proof_path?: string | null;
          status?: Database["public"]["Enums"]["dispatch_status"];
          tenant_id?: string;
          updated_at?: string;
          vehicle_no?: string | null;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatches_delivery_confirmed_by_fkey";
            columns: ["tenant_id", "delivery_confirmed_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "dispatches_dispatched_by_fkey";
            columns: ["tenant_id", "dispatched_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "dispatches_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "dispatches_picked_by_fkey";
            columns: ["tenant_id", "picked_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "dispatches_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      expense_categories: {
        Row: {
          approval_required: boolean;
          auto_approve_limit: number;
          code: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          receipt_required: boolean;
          route_required: boolean;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          approval_required?: boolean;
          auto_approve_limit?: number;
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          receipt_required?: boolean;
          route_required?: boolean;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          approval_required?: boolean;
          auto_approve_limit?: number;
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          receipt_required?: boolean;
          route_required?: boolean;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_categories_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_events: {
        Row: {
          action: string;
          amount: number | null;
          created_at: string;
          expense_id: string;
          id: number;
          new_status: string | null;
          old_status: string | null;
          performed_by: string | null;
          remarks: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          amount?: number | null;
          created_at?: string;
          expense_id: string;
          id?: never;
          new_status?: string | null;
          old_status?: string | null;
          performed_by?: string | null;
          remarks?: string | null;
          tenant_id: string;
        };
        Update: {
          action?: string;
          amount?: number | null;
          created_at?: string;
          expense_id?: string;
          id?: never;
          new_status?: string | null;
          old_status?: string | null;
          performed_by?: string | null;
          remarks?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_events_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          approved_amount: number | null;
          brand_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          category_id: string;
          client_uuid: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          employee_id: string;
          expense_date: string;
          expense_no: string | null;
          id: string;
          notes: string | null;
          outstanding: number | null;
          paid_by: string;
          payment_method: string | null;
          receipt_path: string | null;
          reimbursed_amount: number;
          reimbursement_status: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          route_id: string | null;
          source: string;
          status: string;
          submitted_at: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          approved_amount?: number | null;
          brand_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category_id: string;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          employee_id: string;
          expense_date?: string;
          expense_no?: string | null;
          id?: string;
          notes?: string | null;
          outstanding?: never;
          paid_by?: string;
          payment_method?: string | null;
          receipt_path?: string | null;
          reimbursed_amount?: number;
          reimbursement_status?: never;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          route_id?: string | null;
          source?: string;
          status?: string;
          submitted_at?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          approved_amount?: number | null;
          brand_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          category_id?: string;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          employee_id?: string;
          expense_date?: string;
          expense_no?: string | null;
          id?: string;
          notes?: string | null;
          outstanding?: never;
          paid_by?: string;
          payment_method?: string | null;
          receipt_path?: string | null;
          reimbursed_amount?: number;
          reimbursement_status?: never;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          route_id?: string | null;
          source?: string;
          status?: string;
          submitted_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "expenses_cancelled_by_fkey";
            columns: ["tenant_id", "cancelled_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "expenses_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey";
            columns: ["tenant_id", "reviewed_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "expenses_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "expenses_salesman_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "expenses_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      incentive_payouts: {
        Row: {
          approved_at: string;
          approved_by: string | null;
          billed_earned: number;
          billed_shops: number;
          collected: number;
          collection_due: number;
          collection_earned: number;
          collection_pct: number;
          detail: NonNullable<Json>;
          id: string;
          month: string;
          net_sales: number;
          paid_at: string | null;
          paid_by: string | null;
          paid_method: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference: string | null;
          sales_earned: number;
          salesman_id: string;
          scheme_id: string;
          smart_earned: number;
          smart_shops: number;
          status: string;
          tenant_id: string;
          total: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string;
          approved_by?: string | null;
          billed_earned: number;
          billed_shops: number;
          collected: number;
          collection_due: number;
          collection_earned: number;
          collection_pct: number;
          detail: NonNullable<Json>;
          id?: string;
          month: string;
          net_sales: number;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_method?: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference?: string | null;
          sales_earned: number;
          salesman_id: string;
          scheme_id: string;
          smart_earned: number;
          smart_shops: number;
          status?: string;
          tenant_id: string;
          total: number;
        };
        Update: {
          approved_at?: string;
          approved_by?: string | null;
          billed_earned?: number;
          billed_shops?: number;
          collected?: number;
          collection_due?: number;
          collection_earned?: number;
          collection_pct?: number;
          detail?: NonNullable<Json>;
          id?: string;
          month?: string;
          net_sales?: number;
          paid_at?: string | null;
          paid_by?: string | null;
          paid_method?: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference?: string | null;
          sales_earned?: number;
          salesman_id?: string;
          scheme_id?: string;
          smart_earned?: number;
          smart_shops?: number;
          status?: string;
          tenant_id?: string;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "incentive_payouts_approved_by_fkey";
            columns: ["tenant_id", "approved_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "incentive_payouts_paid_by_fkey";
            columns: ["tenant_id", "paid_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "incentive_payouts_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "incentive_payouts_scheme_id_fkey";
            columns: ["tenant_id", "scheme_id"];
            isOneToOne: false;
            referencedRelation: "incentive_schemes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "incentive_payouts_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      incentive_schemes: {
        Row: {
          billed_amount: number;
          billed_target: number;
          collection_slabs: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          notes: string | null;
          sales_amount: number;
          sales_target: number;
          smart_amount: number;
          smart_min_purchase: number;
          smart_pay_days: number;
          smart_target: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          billed_amount: number;
          billed_target: number;
          collection_slabs: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          id?: string;
          notes?: string | null;
          sales_amount: number;
          sales_target: number;
          smart_amount: number;
          smart_min_purchase: number;
          smart_pay_days: number;
          smart_target: number;
          tenant_id: string;
        };
        Update: {
          billed_amount?: number;
          billed_target?: number;
          collection_slabs?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          notes?: string | null;
          sales_amount?: number;
          sales_target?: number;
          smart_amount?: number;
          smart_min_purchase?: number;
          smart_pay_days?: number;
          smart_target?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incentive_schemes_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "incentive_schemes_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_lines: {
        Row: {
          cgst: number;
          discount_amount: number;
          discount_pct: number;
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          igst: number;
          invoice_id: string;
          line_no: number;
          line_total: number;
          price_mode: Database["public"]["Enums"]["price_tax_mode"];
          product_id: string;
          product_name: string;
          qty: number;
          sgst: number;
          sku: string;
          taxable_value: number;
          tenant_id: string;
          unit_code: string;
          unit_cost: number;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          cgst?: number;
          discount_amount?: number;
          discount_pct?: number;
          gst_rate: number;
          hsn_code?: string | null;
          id?: string;
          igst?: number;
          invoice_id: string;
          line_no: number;
          line_total: number;
          price_mode: Database["public"]["Enums"]["price_tax_mode"];
          product_id: string;
          product_name: string;
          qty: number;
          sgst?: number;
          sku: string;
          taxable_value: number;
          tenant_id: string;
          unit_code: string;
          unit_cost?: number;
          unit_price: number;
        };
        Update: {
          cgst?: number;
          discount_amount?: number;
          discount_pct?: number;
          gst_rate?: number;
          hsn_code?: string | null;
          id?: string;
          igst?: number;
          invoice_id?: string;
          line_no?: number;
          line_total?: number;
          price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          product_id?: string;
          product_name?: string;
          qty?: number;
          sgst?: number;
          sku?: string;
          taxable_value?: number;
          tenant_id?: string;
          unit_code?: string;
          unit_cost?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoice_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          brand_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cgst_total: number;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          discount_total: number;
          due_date: string;
          fy: string;
          grand_total: number;
          id: string;
          igst_total: number;
          invoice_date: string;
          invoice_no: string;
          is_igst: boolean;
          order_id: string;
          place_of_supply: string;
          retailer_id: string;
          retailer_snapshot: NonNullable<Json>;
          round_off: number;
          search_text: string;
          sgst_total: number;
          status: Database["public"]["Enums"]["invoice_status"];
          subtotal: number;
          taxable_total: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cgst_total: number;
          created_at?: string;
          created_by?: string | null;
          credit_days: number;
          discount_total: number;
          due_date: string;
          fy: string;
          grand_total: number;
          id?: string;
          igst_total: number;
          invoice_date: string;
          invoice_no: string;
          is_igst: boolean;
          order_id: string;
          place_of_supply: string;
          retailer_id: string;
          retailer_snapshot: NonNullable<Json>;
          round_off: number;
          search_text: string;
          sgst_total: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal: number;
          taxable_total: number;
          tenant_id: string;
        };
        Update: {
          brand_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cgst_total?: number;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          discount_total?: number;
          due_date?: string;
          fy?: string;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          invoice_date?: string;
          invoice_no?: string;
          is_igst?: boolean;
          order_id?: string;
          place_of_supply?: string;
          retailer_id?: string;
          retailer_snapshot?: NonNullable<Json>;
          round_off?: number;
          search_text?: string;
          sgst_total?: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          subtotal?: number;
          taxable_total?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoices_cancelled_by_fkey";
            columns: ["tenant_id", "cancelled_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "invoices_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["tenant_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoices_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoices_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entries: {
        Row: {
          brand_id: string | null;
          created_at: string;
          created_by: string | null;
          entry_date: string;
          event: string;
          id: string;
          narration: string | null;
          reverses_id: string | null;
          source_id: string;
          source_type: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          entry_date: string;
          event: string;
          id?: string;
          narration?: string | null;
          reverses_id?: string | null;
          source_id: string;
          source_type: string;
          tenant_id: string;
        };
        Update: {
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          entry_date?: string;
          event?: string;
          id?: string;
          narration?: string | null;
          reverses_id?: string | null;
          source_id?: string;
          source_type?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "journal_entries_reverses_id_fkey";
            columns: ["tenant_id", "reverses_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "journal_entries_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_lines: {
        Row: {
          account: string;
          credit: number;
          debit: number;
          employee_id: string | null;
          entry_id: string;
          id: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          account: string;
          credit?: number;
          debit?: number;
          employee_id?: string | null;
          entry_id: string;
          id?: never;
          tenant_id: string;
        };
        Update: {
          account?: string;
          credit?: number;
          debit?: number;
          employee_id?: string | null;
          entry_id?: string;
          id?: never;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_lines_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey";
            columns: ["tenant_id", "entry_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "journal_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          created_at: string;
          district: string | null;
          id: string;
          is_active: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          pincode: string | null;
          tenant_id: string;
          territory_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          district?: string | null;
          id?: string;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          pincode?: string | null;
          tenant_id: string;
          territory_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          district?: string | null;
          id?: string;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          pincode?: string | null;
          tenant_id?: string;
          territory_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "locations_territory_id_fkey";
            columns: ["tenant_id", "territory_id"];
            isOneToOne: false;
            referencedRelation: "territories";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      number_series: {
        Row: {
          doc_type: string;
          fy: string;
          next_value: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          doc_type: string;
          fy: string;
          next_value?: number;
          tenant_id: string;
        };
        Update: {
          doc_type?: string;
          fy?: string;
          next_value?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "number_series_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_lines: {
        Row: {
          discount_amount: number;
          discount_pct: number;
          gst_rate: number;
          id: string;
          line_no: number;
          line_total: number;
          order_id: string;
          price_mode: Database["public"]["Enums"]["price_tax_mode"];
          product_id: string;
          qty: number;
          tax_amount: number;
          taxable_value: number;
          tenant_id: string;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          discount_amount?: number;
          discount_pct?: number;
          gst_rate: number;
          id?: string;
          line_no: number;
          line_total?: number;
          order_id: string;
          price_mode: Database["public"]["Enums"]["price_tax_mode"];
          product_id: string;
          qty: number;
          tax_amount?: number;
          taxable_value?: number;
          tenant_id: string;
          unit_price: number;
        };
        Update: {
          discount_amount?: number;
          discount_pct?: number;
          gst_rate?: number;
          id?: string;
          line_no?: number;
          line_total?: number;
          order_id?: string;
          price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          product_id?: string;
          qty?: number;
          tax_amount?: number;
          taxable_value?: number;
          tenant_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey";
            columns: ["tenant_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "order_lines_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "order_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          brand_id: string | null;
          cancel_reason: string | null;
          client_uuid: string | null;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          discount_total: number;
          grand_total: number;
          id: string;
          notes: string | null;
          order_date: string;
          order_no: string;
          retailer_id: string;
          round_off: number;
          salesman_id: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tax_total: number;
          taxable_total: number;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id?: string | null;
          cancel_reason?: string | null;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_days: number;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          order_date?: string;
          order_no: string;
          retailer_id: string;
          round_off?: number;
          salesman_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_total?: number;
          taxable_total?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string | null;
          cancel_reason?: string | null;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          order_date?: string;
          order_no?: string;
          retailer_id?: string;
          round_off?: number;
          salesman_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_total?: number;
          taxable_total?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "orders_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "orders_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_allocations: {
        Row: {
          allocated_by: string | null;
          amount: number;
          created_at: string;
          id: string;
          invoice_id: string;
          is_auto: boolean;
          payment_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          allocated_by?: string | null;
          amount: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          is_auto?: boolean;
          payment_id: string;
          tenant_id: string;
        };
        Update: {
          allocated_by?: string | null;
          amount?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          is_auto?: boolean;
          payment_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_allocations_allocated_by_fkey";
            columns: ["tenant_id", "allocated_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey";
            columns: ["tenant_id", "payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_allocations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_promises: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string | null;
          promised_date: string;
          remarks: string | null;
          retailer_id: string;
          status: Database["public"]["Enums"]["promise_status"];
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          promised_date: string;
          remarks?: string | null;
          retailer_id: string;
          status?: Database["public"]["Enums"]["promise_status"];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          promised_date?: string;
          remarks?: string | null;
          retailer_id?: string;
          status?: Database["public"]["Enums"]["promise_status"];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_promises_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "payment_promises_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_promises_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_promises_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          bank_name: string | null;
          cheque_date: string | null;
          client_uuid: string | null;
          collected_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          payment_date: string;
          receipt_no: string;
          reference_no: string | null;
          retailer_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          tenant_id: string;
          updated_at: string;
          verified_at: string | null;
          verified_by: string | null;
          visit_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          bank_name?: string | null;
          cheque_date?: string | null;
          client_uuid?: string | null;
          collected_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          payment_date?: string;
          receipt_no: string;
          reference_no?: string | null;
          retailer_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          tenant_id: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          visit_id?: string | null;
        };
        Update: {
          amount?: number;
          bank_name?: string | null;
          cheque_date?: string | null;
          client_uuid?: string | null;
          collected_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          payment_date?: string;
          receipt_no?: string;
          reference_no?: string | null;
          retailer_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          tenant_id?: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_collected_by_fkey";
            columns: ["tenant_id", "collected_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "payments_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payments_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_verified_by_fkey";
            columns: ["tenant_id", "verified_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "payments_visit_fk";
            columns: ["tenant_id", "visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          is_primary: boolean;
          product_id: string;
          sort_order: number;
          storage_path: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          product_id: string;
          sort_order?: number;
          storage_path: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          product_id?: string;
          sort_order?: number;
          storage_path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "product_images_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          brand_id: string;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          default_location_id: string | null;
          default_warehouse_id: string | null;
          description: string | null;
          distributor_price: number;
          distributor_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          is_active: boolean;
          min_stock_qty: number;
          mrp: number;
          mrp_mode: Database["public"]["Enums"]["price_tax_mode"];
          name: string;
          purchase_cost: number;
          purchase_cost_mode: Database["public"]["Enums"]["price_tax_mode"];
          retailer_price: number;
          retailer_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          search_text: string;
          sku: string;
          tenant_id: string;
          unit_code: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          barcode?: string | null;
          brand_id: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_location_id?: string | null;
          default_warehouse_id?: string | null;
          description?: string | null;
          distributor_price?: number;
          distributor_price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate?: number;
          hsn_code?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock_qty?: number;
          mrp?: number;
          mrp_mode?: Database["public"]["Enums"]["price_tax_mode"];
          name: string;
          purchase_cost?: number;
          purchase_cost_mode?: Database["public"]["Enums"]["price_tax_mode"];
          retailer_price?: number;
          retailer_price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          search_text: string;
          sku: string;
          tenant_id: string;
          unit_code?: string;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          brand_id?: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_location_id?: string | null;
          default_warehouse_id?: string | null;
          description?: string | null;
          distributor_price?: number;
          distributor_price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate?: number;
          hsn_code?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock_qty?: number;
          mrp?: number;
          mrp_mode?: Database["public"]["Enums"]["price_tax_mode"];
          name?: string;
          purchase_cost?: number;
          purchase_cost_mode?: Database["public"]["Enums"]["price_tax_mode"];
          retailer_price?: number;
          retailer_price_mode?: Database["public"]["Enums"]["price_tax_mode"];
          search_text?: string;
          sku?: string;
          tenant_id?: string;
          unit_code?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "products_default_location_id_fkey";
            columns: ["tenant_id", "default_location_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "products_default_warehouse_id_fkey";
            columns: ["tenant_id", "default_warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "products_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_unit_code_fkey";
            columns: ["tenant_id", "unit_code"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["tenant_id", "code"];
          },
        ];
      };
      profile_brands: {
        Row: {
          brand_id: string;
          created_at: string;
          tenant_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_brands_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "profile_brands_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_brands_user_id_fkey";
            columns: ["tenant_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          can_reimburse: boolean;
          created_at: string;
          default_tenant_id: string | null;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          share_location: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          can_reimburse?: boolean;
          created_at?: string;
          default_tenant_id?: string | null;
          email?: string | null;
          full_name?: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          share_location?: boolean;
          updated_at?: string;
        };
        Update: {
          can_reimburse?: boolean;
          created_at?: string;
          default_tenant_id?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          share_location?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_default_tenant_id_fkey";
            columns: ["default_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_lines: {
        Row: {
          cgst: number;
          cost_mode: Database["public"]["Enums"]["price_tax_mode"];
          discount_amount: number;
          discount_pct: number;
          gst_rate: number;
          id: string;
          igst: number;
          line_no: number;
          line_total: number;
          product_id: string;
          purchase_id: string;
          qty: number;
          sgst: number;
          taxable_value: number;
          tenant_id: string;
          unit_cost: number;
        };
        ComputedFields: never;
        Insert: {
          cgst?: number;
          cost_mode?: Database["public"]["Enums"]["price_tax_mode"];
          discount_amount?: number;
          discount_pct?: number;
          gst_rate: number;
          id?: string;
          igst?: number;
          line_no: number;
          line_total: number;
          product_id: string;
          purchase_id: string;
          qty: number;
          sgst?: number;
          taxable_value: number;
          tenant_id: string;
          unit_cost: number;
        };
        Update: {
          cgst?: number;
          cost_mode?: Database["public"]["Enums"]["price_tax_mode"];
          discount_amount?: number;
          discount_pct?: number;
          gst_rate?: number;
          id?: string;
          igst?: number;
          line_no?: number;
          line_total?: number;
          product_id?: string;
          purchase_id?: string;
          qty?: number;
          sgst?: number;
          taxable_value?: number;
          tenant_id?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_lines_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey";
            columns: ["tenant_id", "purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_return_lines: {
        Row: {
          cgst: number;
          id: string;
          igst: number;
          line_total: number;
          product_id: string;
          purchase_line_id: string;
          qty: number;
          return_id: string;
          sgst: number;
          taxable_value: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          cgst?: number;
          id?: string;
          igst?: number;
          line_total: number;
          product_id: string;
          purchase_line_id: string;
          qty: number;
          return_id: string;
          sgst?: number;
          taxable_value: number;
          tenant_id: string;
        };
        Update: {
          cgst?: number;
          id?: string;
          igst?: number;
          line_total?: number;
          product_id?: string;
          purchase_line_id?: string;
          qty?: number;
          return_id?: string;
          sgst?: number;
          taxable_value?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_return_lines_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_return_lines_purchase_line_id_fkey";
            columns: ["tenant_id", "purchase_line_id"];
            isOneToOne: false;
            referencedRelation: "purchase_lines";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_return_lines_return_id_fkey";
            columns: ["tenant_id", "return_id"];
            isOneToOne: false;
            referencedRelation: "purchase_returns";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_return_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_returns: {
        Row: {
          brand_id: string;
          cgst_total: number;
          client_uuid: string | null;
          created_at: string;
          created_by: string | null;
          grand_total: number;
          id: string;
          igst_total: number;
          purchase_id: string;
          reason: string;
          return_date: string;
          return_no: string;
          sgst_total: number;
          supplier_id: string;
          taxable_total: number;
          tenant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          cgst_total?: number;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          purchase_id: string;
          reason: string;
          return_date?: string;
          return_no: string;
          sgst_total?: number;
          supplier_id: string;
          taxable_total?: number;
          tenant_id: string;
          warehouse_id: string;
        };
        Update: {
          brand_id?: string;
          cgst_total?: number;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          purchase_id?: string;
          reason?: string;
          return_date?: string;
          return_no?: string;
          sgst_total?: number;
          supplier_id?: string;
          taxable_total?: number;
          tenant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_returns_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_returns_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey";
            columns: ["tenant_id", "purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey";
            columns: ["tenant_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchase_returns_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      purchases: {
        Row: {
          brand_id: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cgst_total: number;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          discount_total: number;
          due_date: string | null;
          expected_date: string | null;
          grand_total: number;
          id: string;
          igst_total: number;
          is_igst: boolean;
          notes: string | null;
          order_date: string;
          other_charges: number;
          purchase_no: string;
          received_at: string | null;
          received_by: string | null;
          received_date: string | null;
          round_off: number;
          sgst_total: number;
          status: Database["public"]["Enums"]["purchase_status"];
          subtotal: number;
          supplier_bill_date: string | null;
          supplier_bill_no: string | null;
          supplier_id: string;
          taxable_total: number;
          tenant_id: string;
          updated_at: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cgst_total?: number;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          discount_total?: number;
          due_date?: string | null;
          expected_date?: string | null;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          is_igst?: boolean;
          notes?: string | null;
          order_date?: string;
          other_charges?: number;
          purchase_no: string;
          received_at?: string | null;
          received_by?: string | null;
          received_date?: string | null;
          round_off?: number;
          sgst_total?: number;
          status?: Database["public"]["Enums"]["purchase_status"];
          subtotal?: number;
          supplier_bill_date?: string | null;
          supplier_bill_no?: string | null;
          supplier_id: string;
          taxable_total?: number;
          tenant_id: string;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          brand_id?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cgst_total?: number;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          discount_total?: number;
          due_date?: string | null;
          expected_date?: string | null;
          grand_total?: number;
          id?: string;
          igst_total?: number;
          is_igst?: boolean;
          notes?: string | null;
          order_date?: string;
          other_charges?: number;
          purchase_no?: string;
          received_at?: string | null;
          received_by?: string | null;
          received_date?: string | null;
          round_off?: number;
          sgst_total?: number;
          status?: Database["public"]["Enums"]["purchase_status"];
          subtotal?: number;
          supplier_bill_date?: string | null;
          supplier_bill_no?: string | null;
          supplier_id?: string;
          taxable_total?: number;
          tenant_id?: string;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchases_cancelled_by_fkey";
            columns: ["tenant_id", "cancelled_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "purchases_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "purchases_received_by_fkey";
            columns: ["tenant_id", "received_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["tenant_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "purchases_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      reimbursement_lines: {
        Row: {
          amount: number;
          created_at: string;
          expense_id: string;
          id: string;
          reimbursement_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          expense_id: string;
          id?: string;
          reimbursement_id: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          expense_id?: string;
          id?: string;
          reimbursement_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reimbursement_lines_expense_id_fkey";
            columns: ["tenant_id", "expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursement_lines_reimbursement_id_fkey";
            columns: ["tenant_id", "reimbursement_id"];
            isOneToOne: false;
            referencedRelation: "reimbursements";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "reimbursement_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      reimbursements: {
        Row: {
          amount: number;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_uuid: string | null;
          created_at: string;
          created_by: string | null;
          employee_id: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          paid_on: string;
          proof_path: string | null;
          reference_no: string | null;
          reimbursement_no: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          employee_id: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          paid_on?: string;
          proof_path?: string | null;
          reference_no?: string | null;
          reimbursement_no?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          employee_id?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          paid_on?: string;
          proof_path?: string | null;
          reference_no?: string | null;
          reimbursement_no?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reimbursements_cancelled_by_fkey";
            columns: ["tenant_id", "cancelled_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "reimbursements_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "reimbursements_salesman_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "reimbursements_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      retailers: {
        Row: {
          alt_mobile: string | null;
          billing_address: string | null;
          billing_city: string | null;
          billing_pincode: string | null;
          billing_state_code: string;
          classification: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          credit_limit: number;
          delivery_address: string | null;
          delivery_city: string | null;
          delivery_pincode: string | null;
          gstin: string | null;
          id: string;
          latitude: number | null;
          location_id: string | null;
          longitude: number | null;
          mobile: string;
          notes: string | null;
          owner_name: string | null;
          route_id: string | null;
          route_sequence: number | null;
          salesman_id: string | null;
          search_text: string | null;
          shop_name: string;
          status: Database["public"]["Enums"]["retailer_status"];
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          alt_mobile?: string | null;
          billing_address?: string | null;
          billing_city?: string | null;
          billing_pincode?: string | null;
          billing_state_code?: string;
          classification?: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          credit_limit?: number;
          delivery_address?: string | null;
          delivery_city?: string | null;
          delivery_pincode?: string | null;
          gstin?: string | null;
          id?: string;
          latitude?: number | null;
          location_id?: string | null;
          longitude?: number | null;
          mobile: string;
          notes?: string | null;
          owner_name?: string | null;
          route_id?: string | null;
          route_sequence?: number | null;
          salesman_id?: string | null;
          search_text?: never;
          shop_name: string;
          status?: Database["public"]["Enums"]["retailer_status"];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          alt_mobile?: string | null;
          billing_address?: string | null;
          billing_city?: string | null;
          billing_pincode?: string | null;
          billing_state_code?: string;
          classification?: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          credit_limit?: number;
          delivery_address?: string | null;
          delivery_city?: string | null;
          delivery_pincode?: string | null;
          gstin?: string | null;
          id?: string;
          latitude?: number | null;
          location_id?: string | null;
          longitude?: number | null;
          mobile?: string;
          notes?: string | null;
          owner_name?: string | null;
          route_id?: string | null;
          route_sequence?: number | null;
          salesman_id?: string | null;
          search_text?: never;
          shop_name?: string;
          status?: Database["public"]["Enums"]["retailer_status"];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "retailers_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "retailers_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "retailers_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "retailers_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "retailers_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          end_date: string | null;
          ended_by: string | null;
          id: string;
          notes: string | null;
          route_id: string;
          salesman_id: string;
          start_date: string;
          status: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          ended_by?: string | null;
          id?: string;
          notes?: string | null;
          route_id: string;
          salesman_id: string;
          start_date: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          ended_by?: string | null;
          id?: string;
          notes?: string | null;
          route_id?: string;
          salesman_id?: string;
          start_date?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_assignments_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_assignments_ended_by_fkey";
            columns: ["tenant_id", "ended_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_assignments_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_assignments_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_assignments_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_events: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          id: number;
          performed_by: string | null;
          route_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          id?: never;
          performed_by?: string | null;
          route_id: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          id?: never;
          performed_by?: string | null;
          route_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_events_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_events_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_locations: {
        Row: {
          created_at: string;
          id: string;
          location_id: string;
          route_id: string;
          sequence: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          location_id: string;
          route_id: string;
          sequence: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          location_id?: string;
          route_id?: string;
          sequence?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_locations_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_locations_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_locations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_outlets: {
        Row: {
          added_at: string;
          added_by: string | null;
          id: string;
          is_active: boolean;
          location_id: string | null;
          remove_reason: string | null;
          removed_at: string | null;
          removed_by: string | null;
          retailer_id: string;
          route_id: string;
          sequence: number;
          tenant_id: string;
          visit_days: number[] | null;
          visit_frequency: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          added_by?: string | null;
          id?: string;
          is_active?: boolean;
          location_id?: string | null;
          remove_reason?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          retailer_id: string;
          route_id: string;
          sequence?: number;
          tenant_id: string;
          visit_days?: number[] | null;
          visit_frequency?: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          id?: string;
          is_active?: boolean;
          location_id?: string | null;
          remove_reason?: string | null;
          removed_at?: string | null;
          removed_by?: string | null;
          retailer_id?: string;
          route_id?: string;
          sequence?: number;
          tenant_id?: string;
          visit_days?: number[] | null;
          visit_frequency?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_outlets_added_by_fkey";
            columns: ["tenant_id", "added_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_outlets_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_outlets_removed_by_fkey";
            columns: ["tenant_id", "removed_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_outlets_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_outlets_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_outlets_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_plans: {
        Row: {
          cancel_reason: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          plan_date: string;
          route_id: string;
          salesman_id: string;
          source: string;
          status: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          plan_date: string;
          route_id: string;
          salesman_id: string;
          source?: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          cancel_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          plan_date?: string;
          route_id?: string;
          salesman_id?: string;
          source?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_plans_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_plans_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "route_plans_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "route_plans_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      routes: {
        Row: {
          archived_at: string | null;
          code: string | null;
          created_at: string;
          default_salesman_id: string | null;
          description: string | null;
          fortnight_anchor: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
          territory_id: string | null;
          updated_at: string;
          visit_days: number[];
          visit_frequency: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          code?: string | null;
          created_at?: string;
          default_salesman_id?: string | null;
          description?: string | null;
          fortnight_anchor?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: string;
          territory_id?: string | null;
          updated_at?: string;
          visit_days?: number[];
          visit_frequency?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string | null;
          created_at?: string;
          default_salesman_id?: string | null;
          description?: string | null;
          fortnight_anchor?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          territory_id?: string | null;
          updated_at?: string;
          visit_days?: number[];
          visit_frequency?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routes_default_salesman_id_fkey";
            columns: ["tenant_id", "default_salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "routes_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_territory_id_fkey";
            columns: ["tenant_id", "territory_id"];
            isOneToOne: false;
            referencedRelation: "territories";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      salesman_locations: {
        Row: {
          accuracy_m: number | null;
          created_at: string;
          id: number;
          latitude: number;
          longitude: number;
          recorded_at: string;
          salesman_id: string;
          source: string;
          tenant_id: string;
          visit_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          created_at?: string;
          id?: never;
          latitude: number;
          longitude: number;
          recorded_at: string;
          salesman_id: string;
          source: string;
          tenant_id: string;
          visit_id?: string | null;
        };
        Update: {
          accuracy_m?: number | null;
          created_at?: string;
          id?: never;
          latitude?: number;
          longitude?: number;
          recorded_at?: string;
          salesman_id?: string;
          source?: string;
          tenant_id?: string;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "salesman_locations_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "salesman_locations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "salesman_locations_visit_id_fkey";
            columns: ["tenant_id", "visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      share_links: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          filename: string;
          path: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          filename: string;
          path: string;
          tenant_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          filename?: string;
          path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "share_links_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "share_links_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_count_lines: {
        Row: {
          count_id: string;
          counted_qty: number | null;
          id: string;
          location_id: string | null;
          product_id: string;
          system_qty: number;
          tenant_id: string;
          variance: number | null;
        };
        ComputedFields: never;
        Insert: {
          count_id: string;
          counted_qty?: number | null;
          id?: string;
          location_id?: string | null;
          product_id: string;
          system_qty: number;
          tenant_id: string;
          variance?: never;
        };
        Update: {
          count_id?: string;
          counted_qty?: number | null;
          id?: string;
          location_id?: string | null;
          product_id?: string;
          system_qty?: number;
          tenant_id?: string;
          variance?: never;
        };
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_count_id_fkey";
            columns: ["tenant_id", "count_id"];
            isOneToOne: false;
            referencedRelation: "stock_counts";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_count_lines_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_count_lines_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_counts: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          brand_id: string;
          counted_by: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          status: Database["public"]["Enums"]["stock_count_status"];
          tenant_id: string;
          updated_at: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          brand_id: string;
          counted_by?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["stock_count_status"];
          tenant_id: string;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          brand_id?: string;
          counted_by?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["stock_count_status"];
          tenant_id?: string;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_counts_approved_by_fkey";
            columns: ["tenant_id", "approved_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "stock_counts_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_counts_counted_by_fkey";
            columns: ["tenant_id", "counted_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "stock_counts_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          brand_id: string;
          client_uuid: string | null;
          created_at: string;
          created_by: string | null;
          id: number;
          location_id: string | null;
          movement_date: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          notes: string | null;
          product_id: string;
          qty: number;
          reason: string | null;
          reference_id: string | null;
          reference_no: string | null;
          reference_type: string | null;
          tenant_id: string;
          transfer_group: string | null;
          unit_cost: number | null;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          location_id?: string | null;
          movement_date?: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          notes?: string | null;
          product_id: string;
          qty: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_no?: string | null;
          reference_type?: string | null;
          tenant_id: string;
          transfer_group?: string | null;
          unit_cost?: number | null;
          warehouse_id: string;
        };
        Update: {
          brand_id?: string;
          client_uuid?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          location_id?: string | null;
          movement_date?: string;
          movement_type?: Database["public"]["Enums"]["stock_movement_type"];
          notes?: string | null;
          product_id?: string;
          qty?: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_no?: string | null;
          reference_type?: string | null;
          tenant_id?: string;
          transfer_group?: string | null;
          unit_cost?: number | null;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      supplier_payment_allocations: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          is_auto: boolean;
          payment_id: string;
          purchase_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          is_auto?: boolean;
          payment_id: string;
          purchase_id: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          is_auto?: boolean;
          payment_id?: string;
          purchase_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_payment_id_fkey";
            columns: ["tenant_id", "payment_id"];
            isOneToOne: false;
            referencedRelation: "supplier_payments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "supplier_payment_allocations_purchase_id_fkey";
            columns: ["tenant_id", "purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "supplier_payment_allocations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_payments: {
        Row: {
          amount: number;
          cancel_reason: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes: string | null;
          payment_date: string;
          payment_no: string;
          reference_no: string | null;
          status: string;
          supplier_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          cancel_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          payment_date: string;
          payment_no: string;
          reference_no?: string | null;
          status?: string;
          supplier_id: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          cancel_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          notes?: string | null;
          payment_date?: string;
          payment_no?: string;
          reference_no?: string | null;
          status?: string;
          supplier_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_payments_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey";
            columns: ["tenant_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "supplier_payments_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          bank_details: string | null;
          brand_id: string | null;
          city: string | null;
          code: string;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          email: string | null;
          gstin: string | null;
          id: string;
          is_active: boolean;
          lead_days: number;
          mobile: string | null;
          name: string;
          notes: string | null;
          pincode: string | null;
          state_code: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          bank_details?: string | null;
          brand_id?: string | null;
          city?: string | null;
          code: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          email?: string | null;
          gstin?: string | null;
          id?: string;
          is_active?: boolean;
          lead_days?: number;
          mobile?: string | null;
          name: string;
          notes?: string | null;
          pincode?: string | null;
          state_code?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          bank_details?: string | null;
          brand_id?: string | null;
          city?: string | null;
          code?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_days?: number;
          email?: string | null;
          gstin?: string | null;
          id?: string;
          is_active?: boolean;
          lead_days?: number;
          mobile?: string | null;
          name?: string;
          notes?: string | null;
          pincode?: string | null;
          state_code?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "suppliers_created_by_fkey";
            columns: ["tenant_id", "created_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "suppliers_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      targets: {
        Row: {
          collection_target: number;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          sales_target: number;
          salesman_id: string;
          set_by: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          collection_target?: number;
          created_at?: string;
          id?: string;
          period_end: string;
          period_start: string;
          sales_target?: number;
          salesman_id: string;
          set_by?: string | null;
          tenant_id: string;
        };
        Update: {
          collection_target?: number;
          created_at?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          sales_target?: number;
          salesman_id?: string;
          set_by?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "targets_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "targets_set_by_fkey";
            columns: ["tenant_id", "set_by"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "targets_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_members: {
        Row: {
          can_reimburse: boolean;
          created_at: string;
          created_by: string | null;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          can_reimburse?: boolean;
          created_at?: string;
          created_by?: string | null;
          is_active?: boolean;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_reimburse?: boolean;
          created_at?: string;
          created_by?: string | null;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "tenant_people";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          business_type: string;
          created_at: string;
          created_by: string | null;
          display_name: string;
          id: string;
          legal_name: string;
          slug: string;
          status: Database["public"]["Enums"]["tenant_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_type?: string;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          id?: string;
          legal_name: string;
          slug: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          updated_at?: string;
        };
        Update: {
          business_type?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          id?: string;
          legal_name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      territories: {
        Row: {
          code: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "territories_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          code: string;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          name: string;
          tenant_id: string;
        };
        Update: {
          code?: string;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_events: {
        Row: {
          accuracy_m: number | null;
          action: string;
          client_uuid: string | null;
          created_at: string;
          happened_at: string;
          id: number;
          latitude: number | null;
          longitude: number | null;
          performed_by: string | null;
          result: Json | null;
          tenant_id: string;
          visit_id: string;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          action: string;
          client_uuid?: string | null;
          created_at?: string;
          happened_at: string;
          id?: never;
          latitude?: number | null;
          longitude?: number | null;
          performed_by?: string | null;
          result?: Json | null;
          tenant_id: string;
          visit_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          action?: string;
          client_uuid?: string | null;
          created_at?: string;
          happened_at?: string;
          id?: never;
          latitude?: number | null;
          longitude?: number | null;
          performed_by?: string | null;
          result?: Json | null;
          tenant_id?: string;
          visit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_events_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_events_visit_id_fkey";
            columns: ["tenant_id", "visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      visits: {
        Row: {
          checkin_at: string | null;
          checkout_accuracy_m: number | null;
          checkout_at: string | null;
          checkout_latitude: number | null;
          checkout_longitude: number | null;
          client_uuid: string | null;
          created_at: string;
          distance_m: number | null;
          geo_status: string | null;
          gps_accuracy_m: number | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          missed_reason: string | null;
          photo_path: string | null;
          planned_date: string;
          planned_sequence: number | null;
          remarks: string | null;
          rescheduled_from: string | null;
          rescheduled_to: string | null;
          retailer_id: string;
          route_id: string | null;
          route_plan_id: string | null;
          salesman_id: string;
          source: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          checkin_at?: string | null;
          checkout_accuracy_m?: number | null;
          checkout_at?: string | null;
          checkout_latitude?: number | null;
          checkout_longitude?: number | null;
          client_uuid?: string | null;
          created_at?: string;
          distance_m?: number | null;
          geo_status?: string | null;
          gps_accuracy_m?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          missed_reason?: string | null;
          photo_path?: string | null;
          planned_date: string;
          planned_sequence?: number | null;
          remarks?: string | null;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          retailer_id: string;
          route_id?: string | null;
          route_plan_id?: string | null;
          salesman_id: string;
          source?: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          checkin_at?: string | null;
          checkout_accuracy_m?: number | null;
          checkout_at?: string | null;
          checkout_latitude?: number | null;
          checkout_longitude?: number | null;
          client_uuid?: string | null;
          created_at?: string;
          distance_m?: number | null;
          geo_status?: string | null;
          gps_accuracy_m?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          missed_reason?: string | null;
          photo_path?: string | null;
          planned_date?: string;
          planned_sequence?: number | null;
          remarks?: string | null;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          retailer_id?: string;
          route_id?: string | null;
          route_plan_id?: string | null;
          salesman_id?: string;
          source?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visits_rescheduled_from_fkey";
            columns: ["tenant_id", "rescheduled_from"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "visits_retailer_id_fkey";
            columns: ["tenant_id", "retailer_id"];
            isOneToOne: false;
            referencedRelation: "retailers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "visits_route_id_fkey";
            columns: ["tenant_id", "route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "visits_route_plan_id_fkey";
            columns: ["tenant_id", "route_plan_id"];
            isOneToOne: false;
            referencedRelation: "route_plans";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "visits_salesman_id_fkey";
            columns: ["tenant_id", "salesman_id"];
            isOneToOne: false;
            referencedRelation: "tenant_members";
            referencedColumns: ["tenant_id", "user_id"];
          },
          {
            foreignKeyName: "visits_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouse_locations: {
        Row: {
          code: string;
          description: string | null;
          id: string;
          is_active: boolean;
          tenant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          tenant_id: string;
          warehouse_id: string;
        };
        Update: {
          code?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          tenant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_locations_warehouse_id_fkey";
            columns: ["tenant_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      warehouses: {
        Row: {
          address: string | null;
          brand_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          brand_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          address?: string | null;
          brand_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_brand_id_fkey";
            columns: ["tenant_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "warehouses_tenant_fk";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      catalog: {
        Row: {
          barcode: string | null;
          brand_id: string;
          brand_name: string;
          category_id: string | null;
          category_name: string | null;
          created_at: string;
          default_location_id: string | null;
          default_warehouse_id: string | null;
          description: string | null;
          distributor_price: number;
          distributor_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          min_stock_qty: number;
          mrp: number;
          mrp_mode: Database["public"]["Enums"]["price_tax_mode"];
          name: string;
          retailer_price: number;
          retailer_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          search_text: string;
          sku: string;
          unit_code: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      expense_list: {
        Row: {
          amount: number;
          approved_amount: number | null;
          brand_code: string | null;
          brand_id: string | null;
          brand_name: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          category_id: string;
          category_name: string;
          client_uuid: string | null;
          created_at: string;
          created_by: string;
          created_by_name: string | null;
          description: string | null;
          employee_id: string;
          employee_name: string;
          employee_role: Database["public"]["Enums"]["app_role"];
          expense_date: string;
          expense_no: string | null;
          id: string;
          notes: string | null;
          outstanding: number | null;
          paid_by: string;
          payment_method: string | null;
          possible_duplicate: boolean | null;
          receipt_path: string | null;
          reimbursed_amount: number;
          reimbursement_status: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          reviewed_by_name: string | null;
          route_id: string | null;
          route_name: string | null;
          source: string;
          status: string;
          submitted_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      inventory_valuation: {
        Row: {
          avg_cost: number | null;
          brand_id: string;
          brand_name: string;
          name: string;
          on_hand: number | null;
          product_id: string;
          sku: string;
          stock_value: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      invoice_balances: {
        Row: {
          ageing_bucket: string | null;
          balance: number | null;
          cheque_pending: number | null;
          credit_days: number;
          credited: number | null;
          days_past_due: number | null;
          due_date: string;
          due_status: string | null;
          grand_total: number;
          invoice_date: string;
          invoice_id: string;
          invoice_no: string;
          paid: number | null;
          retailer_id: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      product_stock: {
        Row: {
          available: number | null;
          brand_id: string;
          is_low: boolean | null;
          is_out: boolean | null;
          min_stock_qty: number;
          on_hand: number | null;
          product_id: string;
          reserved: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      purchase_balances: {
        Row: {
          balance: number | null;
          brand_id: string;
          days_overdue: number | null;
          due_date: string | null;
          grand_total: number;
          paid: number | null;
          purchase_id: string;
          purchase_no: string;
          returned: number | null;
          supplier_bill_date: string | null;
          supplier_bill_no: string | null;
          supplier_id: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      purchase_receipts: {
        Row: {
          credit_days: number;
          expected_date: string | null;
          line_no: number;
          order_date: string;
          product_id: string;
          product_name: string;
          purchase_id: string;
          purchase_no: string;
          qty: number;
          received_date: string | null;
          sku: string;
          status: Database["public"]["Enums"]["purchase_status"];
          supplier_bill_no: string | null;
          supplier_name: string;
          unit_code: string;
          warehouse_id: string;
          warehouse_name: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      purchase_register: {
        Row: {
          brand_id: string;
          brand_name: string;
          line_id: string;
          line_total: number;
          product_id: string;
          product_name: string;
          purchase_id: string;
          purchase_no: string;
          qty: number;
          received_date: string | null;
          sku: string;
          supplier_bill_date: string | null;
          supplier_bill_no: string | null;
          supplier_id: string;
          supplier_name: string;
          tax: number | null;
          taxable_value: number;
        };
        ComputedFields: never;
        Relationships: [];
      };
      retailer_balances: {
        Row: {
          code: string;
          credit_limit: number;
          due_today: number | null;
          not_yet_due: number | null;
          outstanding: number | null;
          overdue: number | null;
          overdue_0_15: number | null;
          overdue_16_30: number | null;
          overdue_31_45: number | null;
          overdue_45_plus: number | null;
          retailer_id: string;
          shop_name: string;
          total_credited: number | null;
          total_invoiced: number | null;
          total_received: number | null;
          unallocated: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      retailer_directory: {
        Row: {
          alt_mobile: string | null;
          billing_address: string | null;
          billing_city: string | null;
          billing_pincode: string | null;
          billing_state_code: string;
          classification: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          credit_limit: number;
          delivery_address: string | null;
          delivery_city: string | null;
          delivery_pincode: string | null;
          gstin: string | null;
          id: string;
          mobile: string;
          notes: string | null;
          owner_name: string | null;
          route_id: string | null;
          route_name: string | null;
          route_sequence: number | null;
          salesman_id: string | null;
          salesman_name: string | null;
          search_text: string | null;
          shop_name: string;
          status: Database["public"]["Enums"]["retailer_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      retailer_ledger: {
        Row: {
          created_at: string | null;
          credit: number | null;
          debit: number | null;
          doc_id: string | null;
          doc_no: string | null;
          entry_date: string | null;
          kind: string | null;
          narration: string | null;
          retailer_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      sales_costs: {
        Row: {
          cost: number | null;
          invoice_id: string;
          line_id: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      sales_register: {
        Row: {
          brand_id: string;
          brand_name: string;
          category_id: string | null;
          due_date: string;
          invoice_date: string;
          invoice_id: string;
          invoice_no: string;
          line_id: string;
          line_total: number;
          product_id: string;
          product_name: string;
          qty: number;
          retailer_code: string;
          retailer_id: string;
          route_id: string | null;
          route_name: string | null;
          salesman_id: string | null;
          salesman_name: string | null;
          shop_name: string;
          sku: string;
          tax: number | null;
          taxable_value: number;
        };
        ComputedFields: never;
        Relationships: [];
      };
      stock_ledger: {
        Row: {
          balance_after: number | null;
          balance_before: number | null;
          brand_id: string;
          brand_name: string;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          id: number;
          movement_date: string;
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          notes: string | null;
          product_id: string;
          product_name: string;
          qty: number;
          reason: string | null;
          reference_id: string | null;
          reference_no: string | null;
          reference_type: string | null;
          sku: string;
          warehouse_id: string;
          warehouse_name: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      stock_on_hand: {
        Row: {
          on_hand: number | null;
          product_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      stock_reserved: {
        Row: {
          product_id: string;
          reserved: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      supplier_ledger: {
        Row: {
          created_at: string | null;
          credit: number | null;
          debit: number | null;
          doc_id: string | null;
          doc_no: string | null;
          entry_date: string | null;
          kind: string | null;
          narration: string | null;
          supplier_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      tenant_people: {
        Row: {
          can_reimburse: boolean;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          share_location: boolean;
          tenant_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_member: {
        Args: { p_email: string; p_role: Database["public"]["Enums"]["app_role"] };
        Returns: string;
      };
      adjust_stock_to: {
        Args: {
          p_client_uuid?: string;
          p_notes?: string;
          p_physical: number;
          p_product_id: string;
          p_reason: string;
          p_warehouse_id: string;
        };
        Returns: number;
      };
      allocate_unallocated: { Args: { p_retailer_id: string }; Returns: number };
      approve_incentives: { Args: { p_month: string; p_override?: boolean }; Returns: number };
      approve_stock_count: { Args: { p_count_id: string }; Returns: number };
      brand_document_number: {
        Args: { p_brand: string; p_date?: string; p_kind: string };
        Returns: string;
      };
      calc_line: {
        Args: {
          p_discount_pct: number;
          p_mode: Database["public"]["Enums"]["price_tax_mode"];
          p_price: number;
          p_qty: number;
          p_rate: number;
        };
        Returns: {
          discount: number;
          gross: number;
          tax: number;
          taxable: number;
        }[];
      };
      can_access_brand: { Args: { p_brand: string }; Returns: boolean };
      can_reimburse_expenses: { Args: Record<PropertyKey, never>; Returns: boolean };
      can_see_expense: { Args: { p_brand: string; p_employee: string }; Returns: boolean };
      can_see_retailer: { Args: { p_retailer_id: string }; Returns: boolean };
      cancel_invoice: { Args: { p_invoice_id: string; p_reason: string }; Returns: undefined };
      cancel_purchase: { Args: { p_purchase_id: string; p_reason: string }; Returns: undefined };
      cancel_reimbursement: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      cancel_supplier_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: undefined;
      };
      change_invoice_terms: {
        Args: { p_credit_days: number; p_invoice_id: string; p_reason: string };
        Returns: string;
      };
      classify_retailers: { Args: Record<PropertyKey, never>; Returns: number };
      confirm_delivery: {
        Args: { p_dispatch_id: string; p_proof_path?: string; p_remarks?: string };
        Returns: undefined;
      };
      confirm_order: {
        Args: { p_order_id: string; p_override_credit?: boolean; p_override_stock?: boolean };
        Returns: string;
      };
      create_credit_note: {
        Args: { p_invoice_id: string; p_lines: Json; p_reason: string; p_restock: boolean };
        Returns: string;
      };
      create_purchase_return: {
        Args: { p_client_uuid?: string; p_lines: Json; p_purchase_id: string; p_reason: string };
        Returns: string;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      current_tenant_id: { Args: Record<PropertyKey, never>; Returns: string };
      dearmor: { Args: { "": string }; Returns: string };
      dispatch_invoice: {
        Args: {
          p_invoice_id: string;
          p_remarks?: string;
          p_vehicle?: string;
          p_warehouse_id: string;
        };
        Returns: string;
      };
      distance_m: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number };
        Returns: number;
      };
      expense_cancel: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      expense_credit_account: { Args: { p_method: string }; Returns: string };
      expense_delete: { Args: { p_id: string }; Returns: string };
      expense_log: {
        Args: {
          p_action: string;
          p_amount: number;
          p_id: string;
          p_new: string;
          p_old: string;
          p_remarks: string;
        };
        Returns: undefined;
      };
      expense_post_approval: { Args: { p_id: string }; Returns: undefined };
      expense_review: {
        Args: { p_amounts?: Json; p_decision: string; p_ids: string[]; p_reason?: string };
        Returns: number;
      };
      expense_save: {
        Args: {
          p_amount: number;
          p_brand_id: string;
          p_category_id: string;
          p_client_uuid: string;
          p_description: string;
          p_employee_id: string;
          p_expense_date: string;
          p_id: string;
          p_notes: string;
          p_paid_by: string;
          p_payment_method: string;
          p_receipt_path: string;
          p_route_id: string;
          p_source: string;
          p_submit: boolean;
        };
        Returns: Json;
      };
      expense_submit: { Args: { p_id: string }; Returns: string };
      expense_submit_internal: { Args: { p_id: string }; Returns: string };
      expense_summary: {
        Args: {
          p_brand?: string;
          p_category?: string;
          p_employee?: string;
          p_from: string;
          p_route?: string;
          p_status?: string;
          p_to: string;
        };
        Returns: {
          approved: number;
          approved_count: number;
          company_paid: number;
          drafts: number;
          employee_paid: number;
          incurred: number;
          outstanding: number;
          pending: number;
          pending_count: number;
          reimbursed: number;
          rejected: number;
          rejected_count: number;
          returned: number;
          submitted: number;
        }[];
      };
      field_time: { Args: { p_at: string }; Returns: string };
      fifo_allocate: { Args: { p_payment_id: string }; Returns: number };
      find_retailer_duplicates: {
        Args: {
          p_city?: string;
          p_exclude_id?: string;
          p_gstin?: string;
          p_mobile: string;
          p_shop_name?: string;
        };
        Returns: {
          city: string;
          code: string;
          id: string;
          mobile_hint: string;
          reason: string;
          shop_name: string;
        }[];
      };
      find_user_id_by_email: { Args: { p_email: string }; Returns: string };
      fy_label: { Args: { p_date: string }; Returns: string };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      generate_route_visits: { Args: { p_date: string; p_route?: string }; Returns: number };
      has_role: { Args: { p_roles: Database["public"]["Enums"]["app_role"][] }; Returns: boolean };
      incentive_collection_amount: { Args: { p_pct: number; p_slabs: Json }; Returns: number };
      incentive_scheme_for: {
        Args: { p_month: string };
        Returns: {
          billed_amount: number;
          billed_target: number;
          collection_slabs: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          notes: string | null;
          sales_amount: number;
          sales_target: number;
          smart_amount: number;
          smart_min_purchase: number;
          smart_pay_days: number;
          smart_target: number;
          tenant_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "incentive_schemes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      incentive_shops: {
        Args: { p_month: string; p_salesman: string };
        Returns: {
          billed_taxable: number;
          billed_total: number;
          city: string;
          code: string;
          due_amount: number;
          due_collected: number;
          invoices: number;
          mobile: string;
          next_deadline: string;
          retailer_id: string;
          shop_name: string;
          status: string;
          unpaid: number;
        }[];
      };
      invoice_open_amount: { Args: { p_invoice_id: string }; Returns: number };
      is_active_user: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_own_upload: { Args: { p_path: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_tenant_member: { Args: { p_user: string }; Returns: boolean };
      ist_today: { Args: Record<PropertyKey, never>; Returns: string };
      list_members: {
        Args: Record<PropertyKey, never>;
        Returns: {
          can_reimburse: boolean;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string;
          role: Database["public"]["Enums"]["app_role"];
          shared: boolean;
        }[];
      };
      mark_incentive_paid: {
        Args: {
          p_method: Database["public"]["Enums"]["payment_method"];
          p_payout_id: string;
          p_reference?: string;
        };
        Returns: undefined;
      };
      member_tenant_count: { Args: { p_user: string }; Returns: number };
      my_brand_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      my_current_route_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      my_route_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      my_tenants: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          id: string;
          is_default: boolean;
          role: Database["public"]["Enums"]["app_role"];
          slug: string;
          status: Database["public"]["Enums"]["tenant_status"];
        }[];
      };
      next_document_number: { Args: { p_date?: string; p_doc_type: string }; Returns: string };
      next_retailer_code: { Args: Record<PropertyKey, never>; Returns: string };
      outlet_due: {
        Args: {
          p_anchor: string;
          p_date: string;
          p_outlet_days: number[];
          p_outlet_freq: string;
          p_route_days: number[];
          p_route_freq: string;
        };
        Returns: boolean;
      };
      password_reset_allowed: { Args: { p_user: string }; Returns: boolean };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      plan_route: {
        Args: { p_date: string; p_notes?: string; p_route_id: string; p_salesman_id: string };
        Returns: string;
      };
      platform_definer_allowlist: { Args: Record<PropertyKey, never>; Returns: string[] };
      post_journal: {
        Args: {
          p_brand: string;
          p_date: string;
          p_event: string;
          p_lines: Json;
          p_narration: string;
          p_reverses?: string;
          p_source_id: string;
          p_source_type: string;
        };
        Returns: string;
      };
      product_available: { Args: { p_product_id: string }; Returns: number };
      product_avg_cost: { Args: { p_product_id: string }; Returns: number };
      purchase_open_amount: { Args: { p_purchase_id: string }; Returns: number };
      rate_limit_hit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      reallocate_payment: {
        Args: { p_allocations: Json; p_payment_id: string };
        Returns: undefined;
      };
      receive_purchase: {
        Args: {
          p_bill_date: string;
          p_bill_no: string;
          p_purchase_id: string;
          p_received_date?: string;
          p_update_cost?: boolean;
        };
        Returns: undefined;
      };
      recent_app_errors: {
        Args: { p_limit?: number };
        Returns: {
          at: string;
          digest: string;
          message: string;
          path: string;
          source: string;
          user_name: string;
        }[];
      };
      record_location: {
        Args: { p_accuracy: number; p_at: string; p_lat: number; p_lng: number };
        Returns: boolean;
      };
      record_payment: {
        Args: {
          p_allocations?: Json;
          p_amount: number;
          p_bank?: string;
          p_cheque_date?: string;
          p_client_uuid?: string;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_notes?: string;
          p_payment_date?: string;
          p_reference?: string;
          p_retailer_id: string;
          p_visit_id?: string;
        };
        Returns: string;
      };
      record_supplier_payment: {
        Args: {
          p_allocations?: Json;
          p_amount: number;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_notes?: string;
          p_payment_date?: string;
          p_reference?: string;
          p_supplier_id: string;
        };
        Returns: string;
      };
      reimburse_expenses: {
        Args: {
          p_client_uuid: string;
          p_lines: Json;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_notes: string;
          p_paid_on: string;
          p_proof_path: string;
          p_reference: string;
        };
        Returns: string;
      };
      reject_payment: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      reopen_incentive: { Args: { p_payout_id: string }; Returns: undefined };
      reorder_suggestions: {
        Args: { p_brand: string };
        Returns: {
          available: number;
          avg_daily: number;
          category_name: string;
          cost_mode: Database["public"]["Enums"]["price_tax_mode"];
          days_left: number;
          lead_days: number;
          min_stock_qty: number;
          name: string;
          on_order: number;
          product_id: string;
          reorder_point: number;
          sku: string;
          sold_30d: number;
          suggested_qty: number;
          supplier_id: string;
          supplier_name: string;
          unit_code: string;
          unit_cost: number;
          urgency: string;
        }[];
      };
      report_app_error: {
        Args: {
          p_detail?: string;
          p_digest?: string;
          p_message: string;
          p_path?: string;
          p_source: string;
          p_tenant?: string;
          p_user?: string;
        };
        Returns: undefined;
      };
      require_route_admin: { Args: Record<PropertyKey, never>; Returns: undefined };
      reverse_journal: {
        Args: {
          p_date: string;
          p_event: string;
          p_narration: string;
          p_new_event: string;
          p_source_id: string;
          p_source_type: string;
        };
        Returns: string;
      };
      route_archive: {
        Args: { p_archive: boolean; p_id: string; p_reason?: string };
        Returns: undefined;
      };
      route_assign: {
        Args: { p_notes?: string; p_route: string; p_salesman: string; p_start: string };
        Returns: string;
      };
      route_assignment_pause: { Args: { p_paused: boolean; p_route: string }; Returns: undefined };
      route_code_for: { Args: { p_name: string }; Returns: string };
      route_drop_future_visits: {
        Args: { p_from: string; p_retailer: string; p_route: string };
        Returns: number;
      };
      route_log: {
        Args: { p_action: string; p_details: Json; p_route: string };
        Returns: undefined;
      };
      route_outlet_remove: {
        Args: { p_reason?: string; p_retailer: string; p_route: string };
        Returns: undefined;
      };
      route_outlet_remove_internal: {
        Args: { p_reason: string; p_retailer: string; p_route: string };
        Returns: undefined;
      };
      route_outlet_update: {
        Args: {
          p_location: string;
          p_retailer: string;
          p_route: string;
          p_visit_days: number[];
          p_visit_frequency: string;
        };
        Returns: undefined;
      };
      route_outlets_add: {
        Args: { p_location: string; p_move?: boolean; p_retailer_ids: string[]; p_route: string };
        Returns: Json;
      };
      route_outlets_reorder: {
        Args: { p_location: string; p_retailer_ids: string[]; p_route: string };
        Returns: undefined;
      };
      route_resequence: { Args: { p_route: string }; Returns: undefined };
      route_save: {
        Args: {
          p_code: string;
          p_description: string;
          p_fortnight_anchor: string;
          p_id: string;
          p_is_active: boolean;
          p_name: string;
          p_sort_order: number;
          p_territory_id: string;
          p_visit_days: number[];
          p_visit_frequency: string;
        };
        Returns: string;
      };
      route_schedule: {
        Args: { p_days: number; p_from: string; p_route?: string };
        Returns: {
          outlets: number;
          plan_date: string;
          reason: string;
          route_id: string;
          salesman_id: string;
          status: string;
        }[];
      };
      route_set_locations: {
        Args: {
          p_location_ids: string[];
          p_move_to?: string;
          p_remove_outlets?: boolean;
          p_route: string;
        };
        Returns: Json;
      };
      route_skip_day: {
        Args: { p_date: string; p_reason: string; p_route: string; p_skip?: boolean };
        Returns: undefined;
      };
      route_unassign: { Args: { p_last_day: string; p_route: string }; Returns: undefined };
      salesman_incentive: { Args: { p_month: string; p_salesman: string }; Returns: Json };
      save_purchase: {
        Args: {
          p_credit_days: number;
          p_expected_date: string;
          p_lines: Json;
          p_notes: string;
          p_order_date: string;
          p_other_charges: number;
          p_purchase_id: string;
          p_supplier_id: string;
          p_warehouse_id: string;
        };
        Returns: string;
      };
      save_quotation: {
        Args: {
          p_client_uuid?: string;
          p_credit_days: number;
          p_lines: Json;
          p_notes: string;
          p_order_id: string;
          p_retailer_id: string;
        };
        Returns: string;
      };
      search_catalog: {
        Args: { p_active?: boolean; p_brand?: string; p_limit?: number; p_words: string[] };
        Returns: {
          barcode: string | null;
          brand_id: string;
          brand_name: string;
          category_id: string | null;
          category_name: string | null;
          created_at: string;
          default_location_id: string | null;
          default_warehouse_id: string | null;
          description: string | null;
          distributor_price: number;
          distributor_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          min_stock_qty: number;
          mrp: number;
          mrp_mode: Database["public"]["Enums"]["price_tax_mode"];
          name: string;
          retailer_price: number;
          retailer_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          search_text: string;
          sku: string;
          unit_code: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "catalog";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_condition: { Args: { p_words: string[] }; Returns: string };
      search_invoices: {
        Args: { p_words: string[] };
        Returns: {
          brand_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cgst_total: number;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          discount_total: number;
          due_date: string;
          fy: string;
          grand_total: number;
          id: string;
          igst_total: number;
          invoice_date: string;
          invoice_no: string;
          is_igst: boolean;
          order_id: string;
          place_of_supply: string;
          retailer_id: string;
          retailer_snapshot: NonNullable<Json>;
          round_off: number;
          search_text: string;
          sgst_total: number;
          status: Database["public"]["Enums"]["invoice_status"];
          subtotal: number;
          taxable_total: number;
          tenant_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "invoices";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_products: {
        Args: { p_words: string[] };
        Returns: {
          barcode: string | null;
          brand_id: string;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          default_location_id: string | null;
          default_warehouse_id: string | null;
          description: string | null;
          distributor_price: number;
          distributor_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          gst_rate: number;
          hsn_code: string | null;
          id: string;
          is_active: boolean;
          min_stock_qty: number;
          mrp: number;
          mrp_mode: Database["public"]["Enums"]["price_tax_mode"];
          name: string;
          purchase_cost: number;
          purchase_cost_mode: Database["public"]["Enums"]["price_tax_mode"];
          retailer_price: number;
          retailer_price_mode: Database["public"]["Enums"]["price_tax_mode"];
          search_text: string;
          sku: string;
          tenant_id: string;
          unit_code: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "products";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_retailer_directory: {
        Args: { p_words: string[] };
        Returns: {
          alt_mobile: string | null;
          billing_address: string | null;
          billing_city: string | null;
          billing_pincode: string | null;
          billing_state_code: string;
          classification: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          credit_limit: number;
          delivery_address: string | null;
          delivery_city: string | null;
          delivery_pincode: string | null;
          gstin: string | null;
          id: string;
          mobile: string;
          notes: string | null;
          owner_name: string | null;
          route_id: string | null;
          route_name: string | null;
          route_sequence: number | null;
          salesman_id: string | null;
          salesman_name: string | null;
          search_text: string | null;
          shop_name: string;
          status: Database["public"]["Enums"]["retailer_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "retailer_directory";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_retailers: {
        Args: { p_words: string[] };
        Returns: {
          alt_mobile: string | null;
          billing_address: string | null;
          billing_city: string | null;
          billing_pincode: string | null;
          billing_state_code: string;
          classification: Database["public"]["Enums"]["retailer_class"] | null;
          classified_at: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          credit_days: number;
          credit_limit: number;
          delivery_address: string | null;
          delivery_city: string | null;
          delivery_pincode: string | null;
          gstin: string | null;
          id: string;
          latitude: number | null;
          location_id: string | null;
          longitude: number | null;
          mobile: string;
          notes: string | null;
          owner_name: string | null;
          route_id: string | null;
          route_sequence: number | null;
          salesman_id: string | null;
          search_text: string | null;
          shop_name: string;
          status: Database["public"]["Enums"]["retailer_status"];
          tenant_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "retailers";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      set_location_sharing: { Args: { p_on: boolean }; Returns: undefined };
      set_member: {
        Args: {
          p_active: boolean;
          p_can_reimburse: boolean;
          p_full_name: string;
          p_phone: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_user: string;
        };
        Returns: undefined;
      };
      set_payment_status: {
        Args: {
          p_note?: string;
          p_payment_id: string;
          p_status: Database["public"]["Enums"]["payment_status"];
        };
        Returns: undefined;
      };
      set_retailer_location: {
        Args: { p_accuracy: number; p_lat: number; p_lng: number; p_retailer: string };
        Returns: undefined;
      };
      set_user_brands: { Args: { p_brands: string[]; p_user: string }; Returns: undefined };
      start_stock_count: { Args: { p_notes?: string; p_warehouse_id: string }; Returns: string };
      storage_object_tenant: { Args: { p_name: string }; Returns: string };
      storage_user_folder: { Args: { p_name: string }; Returns: string };
      supplier_allocate_unallocated: { Args: { p_supplier_id: string }; Returns: number };
      supplier_fifo_allocate: { Args: { p_payment_id: string }; Returns: number };
      sync_route_salesmen: { Args: Record<PropertyKey, never>; Returns: undefined };
      system_health: { Args: Record<PropertyKey, never>; Returns: Json };
      tenant_public_profile: {
        Args: { p_slug: string };
        Returns: {
          display_name: string;
          logo_path: string;
          slug: string;
        }[];
      };
      tenant_scoped_tables: { Args: Record<PropertyKey, never>; Returns: string[] };
      tenant_state_code: { Args: Record<PropertyKey, never>; Returns: string };
      transfer_stock: {
        Args: {
          p_from_warehouse: string;
          p_product_id: string;
          p_qty: number;
          p_reason?: string;
          p_to_location?: string;
          p_to_warehouse: string;
        };
        Returns: string;
      };
      verify_payments: { Args: { p_ids: string[] }; Returns: number };
      visit_check_in: {
        Args: {
          p_accuracy: number;
          p_at: string;
          p_client_uuid: string;
          p_lat: number;
          p_lng: number;
          p_retailer: string;
          p_visit: string;
        };
        Returns: Json;
      };
      visit_check_out: {
        Args: {
          p_accuracy: number;
          p_at: string;
          p_client_uuid: string;
          p_lat: number;
          p_lng: number;
          p_photo_path: string;
          p_remarks: string;
          p_retailer: string;
          p_visit: string;
        };
        Returns: Json;
      };
      visit_for: {
        Args: { p_at: string; p_create: boolean; p_retailer: string; p_visit: string };
        Returns: {
          checkin_at: string | null;
          checkout_accuracy_m: number | null;
          checkout_at: string | null;
          checkout_latitude: number | null;
          checkout_longitude: number | null;
          client_uuid: string | null;
          created_at: string;
          distance_m: number | null;
          geo_status: string | null;
          gps_accuracy_m: number | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          missed_reason: string | null;
          photo_path: string | null;
          planned_date: string;
          planned_sequence: number | null;
          remarks: string | null;
          rescheduled_from: string | null;
          rescheduled_to: string | null;
          retailer_id: string;
          route_id: string | null;
          route_plan_id: string | null;
          salesman_id: string;
          source: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "visits";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      visit_mark_missed: {
        Args: {
          p_at: string;
          p_client_uuid: string;
          p_reason: string;
          p_remarks: string;
          p_retailer: string;
          p_visit: string;
        };
        Returns: Json;
      };
      visit_reschedule: {
        Args: {
          p_at: string;
          p_client_uuid: string;
          p_new_date: string;
          p_reason: string;
          p_retailer: string;
          p_visit: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "super_admin" | "manager" | "billing" | "warehouse" | "salesman";
      credit_note_status: "issued" | "cancelled";
      dispatch_status: "picking" | "dispatched" | "delivered";
      invoice_status: "issued" | "cancelled";
      order_status: "quotation" | "invoiced" | "dispatched" | "delivered" | "cancelled";
      payment_method: "cash" | "upi" | "bank_transfer" | "cheque";
      payment_status: "received" | "cheque_pending" | "bounced" | "cancelled";
      price_tax_mode: "inclusive" | "exclusive";
      promise_status: "open" | "kept" | "broken" | "cancelled";
      purchase_status: "ordered" | "received" | "cancelled";
      retailer_class: "star" | "average" | "needs_attention" | "high_credit_risk";
      retailer_status: "active" | "on_hold" | "blocked" | "inactive";
      stock_count_status: "draft" | "submitted" | "approved" | "cancelled";
      stock_movement_type:
        | "opening"
        | "stock_in"
        | "transfer_out"
        | "transfer_in"
        | "adjustment"
        | "damage"
        | "reconciliation"
        | "dispatch"
        | "dispatch_reversal"
        | "credit_note_return"
        | "stock_out"
        | "purchase_return";
      tenant_status: "trial" | "active" | "suspended" | "closed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "manager", "billing", "warehouse", "salesman"],
      credit_note_status: ["issued", "cancelled"],
      dispatch_status: ["picking", "dispatched", "delivered"],
      invoice_status: ["issued", "cancelled"],
      order_status: ["quotation", "invoiced", "dispatched", "delivered", "cancelled"],
      payment_method: ["cash", "upi", "bank_transfer", "cheque"],
      payment_status: ["received", "cheque_pending", "bounced", "cancelled"],
      price_tax_mode: ["inclusive", "exclusive"],
      promise_status: ["open", "kept", "broken", "cancelled"],
      purchase_status: ["ordered", "received", "cancelled"],
      retailer_class: ["star", "average", "needs_attention", "high_credit_risk"],
      retailer_status: ["active", "on_hold", "blocked", "inactive"],
      stock_count_status: ["draft", "submitted", "approved", "cancelled"],
      stock_movement_type: [
        "opening",
        "stock_in",
        "transfer_out",
        "transfer_in",
        "adjustment",
        "damage",
        "reconciliation",
        "dispatch",
        "dispatch_reversal",
        "credit_note_return",
        "stock_out",
        "purchase_return",
      ],
      tenant_status: ["trial", "active", "suspended", "closed"],
    },
  },
} as const;
