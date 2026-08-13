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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign: {
        Row: {
          announcement: string
          created_at: string
          deadline: string
          id: string
          images: Json
          items: Json
          opened_at: string | null
          slug: string
          status: string
          threshold: number
          title: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          announcement?: string
          created_at?: string
          deadline: string
          id?: string
          images?: Json
          items?: Json
          opened_at?: string | null
          slug?: string
          status?: string
          threshold: number
          title: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          announcement?: string
          created_at?: string
          deadline?: string
          id?: string
          images?: Json
          items?: Json
          opened_at?: string | null
          slug?: string
          status?: string
          threshold?: number
          title?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      campaign_access: {
        Row: {
          campaign_id: string
          granted_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          granted_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          granted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_access_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_access_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_access_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_draft: {
        Row: {
          announcement: string
          campaign_id: string
          created_at: string
          images: Json
          items: Json
          threshold: number
          title: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          announcement?: string
          campaign_id: string
          created_at?: string
          images?: Json
          items?: Json
          threshold: number
          title: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          announcement?: string
          campaign_id?: string
          created_at?: string
          images?: Json
          items?: Json
          threshold?: number
          title?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_draft_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_draft_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_draft_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_item: {
        Row: {
          active: boolean
          campaign_id: string
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_item_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_item_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_item_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          line_user_id: string | null
          name: string
          order_count: number
          period: number
          total_spent: number
          unit: string
          updated_at: string
          vip_level: number
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          line_user_id?: string | null
          name: string
          order_count?: number
          period?: number
          total_spent?: number
          unit: string
          updated_at?: string
          vip_level?: number
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          line_user_id?: string | null
          name?: string
          order_count?: number
          period?: number
          total_spent?: number
          unit?: string
          updated_at?: string
          vip_level?: number
        }
        Relationships: []
      }
      order_item: {
        Row: {
          campaign_id: string
          campaign_item_id: string
          created_at: string
          id: string
          order_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_item_id: string
          created_at?: string
          id?: string
          order_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_item_id?: string
          created_at?: string
          id?: string
          order_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_campaign_id_campaign_item_id_fkey"
            columns: ["campaign_id", "campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_item"
            referencedColumns: ["campaign_id", "id"]
          },
          {
            foreignKeyName: "order_item_order_id_campaign_id_fkey"
            columns: ["order_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "order_wall"
            referencedColumns: ["order_id", "campaign_id"]
          },
          {
            foreignKeyName: "order_item_order_id_campaign_id_fkey"
            columns: ["order_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "order_item_order_id_campaign_id_fkey"
            columns: ["order_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "organizer_order_status"
            referencedColumns: ["order_id", "campaign_id"]
          },
        ]
      }
      orders: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string
          id: string
          note: string | null
          pickup_status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          pickup_status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          pickup_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          paid: boolean
          paid_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          paid?: boolean
          paid_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          paid?: boolean
          paid_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "order_wall"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "organizer_order_status"
            referencedColumns: ["order_id"]
          },
        ]
      }
      product_template: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_price: number | null
          id: string
          name: string
          note: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_price?: number | null
          id?: string
          name: string
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_price?: number | null
          id?: string
          name?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_campaign_list: {
        Row: {
          created_at: string | null
          id: string | null
          opened_at: string | null
          slug: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      campaign_public: {
        Row: {
          announcement: string | null
          created_at: string | null
          deadline: string | null
          id: string | null
          images: Json | null
          items: Json | null
          opened_at: string | null
          slug: string | null
          status: string | null
          threshold: number | null
          title: string | null
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          announcement?: string | null
          created_at?: string | null
          deadline?: string | null
          id?: string | null
          images?: Json | null
          items?: Json | null
          opened_at?: string | null
          slug?: string | null
          status?: string | null
          threshold?: number | null
          title?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          announcement?: string | null
          created_at?: string | null
          deadline?: string | null
          id?: string | null
          images?: Json | null
          items?: Json | null
          opened_at?: string | null
          slug?: string | null
          status?: string | null
          threshold?: number | null
          title?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      order_wall: {
        Row: {
          campaign_id: string | null
          campaign_item_id: string | null
          campaign_slug: string | null
          customer_id: string | null
          customer_name: string | null
          item_active: boolean | null
          item_code: string | null
          item_name: string | null
          item_updated_at: string | null
          note: string | null
          order_id: string | null
          order_updated_at: string | null
          ordered_at: string | null
          period: number | null
          qty: number | null
          sort_order: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_order_status: {
        Row: {
          amount: number | null
          campaign_id: string | null
          order_id: string | null
          paid: boolean | null
          paid_at: string | null
          pickup_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_campaign_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      campaign_image_path_is_live: {
        Args: { p_name: string }
        Returns: boolean
      }
      campaign_is_editable: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      can_edit_order: { Args: { p_order_id: string }; Returns: boolean }
      create_campaign_draft: {
        Args: { p_title?: string }
        Returns: {
          announcement: string
          created_at: string
          deadline: string
          id: string
          images: Json
          items: Json
          opened_at: string | null
          slug: string
          status: string
          threshold: number
          title: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaign"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      customer_is_wall_visible: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      delete_campaign_permanently: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      get_customer_self: {
        Args: never
        Returns: {
          id: string
          name: string
          period: number
          unit: string
        }[]
      }
      has_campaign_access: { Args: { p_campaign_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      join_campaign_by_slug: {
        Args: { p_slug: string }
        Returns: {
          announcement: string
          created_at: string
          deadline: string
          id: string
          images: Json
          items: Json
          opened_at: string
          slug: string
          status: string
          threshold: number
          title: string
          unit_price: number
          updated_at: string
        }[]
      }
      owns_customer: { Args: { p_customer_id: string }; Returns: boolean }
      owns_order: { Args: { p_order_id: string }; Returns: boolean }
      publish_campaign_draft: {
        Args: { p_campaign_id: string }
        Returns: {
          announcement: string
          created_at: string
          deadline: string
          id: string
          images: Json
          items: Json
          opened_at: string | null
          slug: string
          status: string
          threshold: number
          title: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaign"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_campaign_status: {
        Args: { p_campaign_id: string; p_status: string }
        Returns: {
          announcement: string
          created_at: string
          deadline: string
          id: string
          images: Json
          items: Json
          opened_at: string | null
          slug: string
          status: string
          threshold: number
          title: string
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaign"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_fulfillment: {
        Args: { p_order_id: string; p_paid: boolean; p_pickup_status: string }
        Returns: Json
      }
      submit_customer_order: {
        Args: { p_campaign_id: string; p_items: Json }
        Returns: Json
      }
      valid_campaign_images: { Args: { p_images: Json }; Returns: boolean }
      valid_campaign_items: { Args: { p_items: Json }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
