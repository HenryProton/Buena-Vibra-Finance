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
      caja_settings: {
        Row: {
          aporte_mensual: number
          fecha_fin: string
          fecha_inicio: string
          id: boolean
          normas: string
          updated_at: string
        }
        Insert: {
          aporte_mensual?: number
          fecha_fin?: string
          fecha_inicio?: string
          id?: boolean
          normas?: string
          updated_at?: string
        }
        Update: {
          aporte_mensual?: number
          fecha_fin?: string
          fecha_inicio?: string
          id?: boolean
          normas?: string
          updated_at?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          amount_capital: number
          amount_interest: number
          channel_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          loan_id: string
          note: string | null
          payment_date: string
          reported_at: string
          status: Database["public"]["Enums"]["payment_status"]
          user_id: string
        }
        Insert: {
          amount_capital?: number
          amount_interest?: number
          channel_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          loan_id: string
          note?: string | null
          payment_date?: string
          reported_at?: string
          status?: Database["public"]["Enums"]["payment_status"]
          user_id: string
        }
        Update: {
          amount_capital?: number
          amount_interest?: number
          channel_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          loan_id?: string
          note?: string | null
          payment_date?: string
          reported_at?: string
          status?: Database["public"]["Enums"]["payment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          daily_rate: number
          disbursed_at: string | null
          disbursement_channel_id: string | null
          id: string
          note: string | null
          principal: number
          rate_type: Database["public"]["Enums"]["loan_rate_type"]
          rate_value: number
          requested_at: string
          status: Database["public"]["Enums"]["loan_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_rate?: number
          disbursed_at?: string | null
          disbursement_channel_id?: string | null
          id?: string
          note?: string | null
          principal: number
          rate_type?: Database["public"]["Enums"]["loan_rate_type"]
          rate_value?: number
          requested_at?: string
          status?: Database["public"]["Enums"]["loan_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_rate?: number
          disbursed_at?: string | null
          disbursement_channel_id?: string | null
          id?: string
          note?: string | null
          principal?: number
          rate_type?: Database["public"]["Enums"]["loan_rate_type"]
          rate_value?: number
          requested_at?: string
          status?: Database["public"]["Enums"]["loan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_disbursement_channel_id_fkey"
            columns: ["disbursement_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_contributions: {
        Row: {
          amount: number
          channel_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          month: number
          note: string | null
          num_acciones: number
          reported_at: string | null
          status: Database["public"]["Enums"]["contribution_status"]
          user_id: string
          year: number
        }
        Insert: {
          amount: number
          channel_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          month: number
          note?: string | null
          num_acciones?: number
          reported_at?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          channel_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          month?: number
          note?: string | null
          num_acciones?: number
          reported_at?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_contributions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cedula: string | null
          created_at: string
          fecha_fin: string | null
          fecha_inicio: string | null
          full_name: string
          id: string
          joined_at: string
          num_acciones: number
          phone: string | null
          status: Database["public"]["Enums"]["profile_status"]
          theme_preference: string
          updated_at: string
        }
        Insert: {
          cedula?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          full_name?: string
          id: string
          joined_at?: string
          num_acciones?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          cedula?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          full_name?: string
          id?: string
          joined_at?: string
          num_acciones?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      channel_balance: { Args: { _channel_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "socio"
      contribution_status: "pendiente" | "reportado" | "confirmado"
      loan_rate_type: "daily" | "monthly"
      loan_status: "pendiente_aprobacion" | "activo" | "pagado" | "rechazado"
      payment_status: "reportado" | "confirmado"
      profile_status: "pendiente" | "activo" | "retirado"
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
      app_role: ["admin", "socio"],
      contribution_status: ["pendiente", "reportado", "confirmado"],
      loan_rate_type: ["daily", "monthly"],
      loan_status: ["pendiente_aprobacion", "activo", "pagado", "rechazado"],
      payment_status: ["reportado", "confirmado"],
      profile_status: ["pendiente", "activo", "retirado"],
    },
  },
} as const
