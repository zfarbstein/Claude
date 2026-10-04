export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  calendar: {
    Tables: {
      categories: {
        Row: {
          color: string;
          key: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          color: string;
          key: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          color?: string;
          key?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      dated_items: {
        Row: {
          all_day: boolean;
          blocks_availability: boolean | null;
          category: string;
          course: string | null;
          created_at: string;
          dismissed: boolean;
          ends_at: string;
          external_uid: string | null;
          id: string;
          kind: string;
          member_id: string;
          semester_id: string;
          source: string;
          starts_at: string;
          title: string;
        };
        Insert: {
          all_day?: boolean;
          blocks_availability?: never;
          category: string;
          course?: string | null;
          created_at?: string;
          dismissed?: boolean;
          ends_at: string;
          external_uid?: string | null;
          id?: string;
          kind: string;
          member_id: string;
          semester_id: string;
          source: string;
          starts_at: string;
          title: string;
        };
        Update: {
          all_day?: boolean;
          blocks_availability?: never;
          category?: string;
          course?: string | null;
          created_at?: string;
          dismissed?: boolean;
          ends_at?: string;
          external_uid?: string | null;
          id?: string;
          kind?: string;
          member_id?: string;
          semester_id?: string;
          source?: string;
          starts_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dated_items_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      event_series: {
        Row: {
          by_weekday: number[] | null;
          created_at: string;
          created_by: string | null;
          freq: string;
          id: string;
          interval: number;
          occurrence_count: number | null;
          until_date: string | null;
        };
        Insert: {
          by_weekday?: number[] | null;
          created_at?: string;
          created_by?: string | null;
          freq: string;
          id?: string;
          interval?: number;
          occurrence_count?: number | null;
          until_date?: string | null;
        };
        Update: {
          by_weekday?: number[] | null;
          created_at?: string;
          created_by?: string | null;
          freq?: string;
          id?: string;
          interval?: number;
          occurrence_count?: number | null;
          until_date?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          all_day: boolean;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string;
          hidden_from_associates: boolean;
          id: string;
          location: string | null;
          required: boolean;
          rsvp_enabled: boolean;
          series_id: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          all_day?: boolean;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at: string;
          hidden_from_associates?: boolean;
          id?: string;
          location?: string | null;
          required?: boolean;
          rsvp_enabled?: boolean;
          series_id?: string | null;
          starts_at: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          all_day?: boolean;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string;
          hidden_from_associates?: boolean;
          id?: string;
          location?: string | null;
          required?: boolean;
          rsvp_enabled?: boolean;
          series_id?: string | null;
          starts_at?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "events_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "event_series";
            referencedColumns: ["id"];
          },
        ];
      };
      feed_tokens: {
        Row: {
          created_at: string;
          member_id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          member_id: string;
          token?: string;
        };
        Update: {
          created_at?: string;
          member_id?: string;
          token?: string;
        };
        Relationships: [];
      };
      rsvps: {
        Row: {
          event_id: string;
          member_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          member_id?: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          member_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_submissions: {
        Row: {
          canvas_feed_url: string | null;
          canvas_sync_error: string | null;
          canvas_synced_at: string | null;
          classes_done_at: string | null;
          completed: boolean | null;
          exams_done_at: string | null;
          member_id: string;
          obligations_done_at: string | null;
          semester_id: string;
          updated_at: string;
        };
        Insert: {
          canvas_feed_url?: string | null;
          canvas_sync_error?: string | null;
          canvas_synced_at?: string | null;
          classes_done_at?: string | null;
          completed?: never;
          exams_done_at?: string | null;
          member_id: string;
          obligations_done_at?: string | null;
          semester_id: string;
          updated_at?: string;
        };
        Update: {
          canvas_feed_url?: string | null;
          canvas_sync_error?: string | null;
          canvas_synced_at?: string | null;
          classes_done_at?: string | null;
          completed?: never;
          exams_done_at?: string | null;
          member_id?: string;
          obligations_done_at?: string | null;
          semester_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_submissions_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_uploads: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          member_id: string;
          parsed: Json | null;
          semester_id: string;
          source_url: string | null;
          step: string;
          storage_paths: string[];
          text_content: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          member_id: string;
          parsed?: Json | null;
          semester_id: string;
          source_url?: string | null;
          step: string;
          storage_paths?: string[];
          text_content?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          member_id?: string;
          parsed?: Json | null;
          semester_id?: string;
          source_url?: string | null;
          step?: string;
          storage_paths?: string[];
          text_content?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_uploads_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
      semesters: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_on: string;
          id: string;
          is_current: boolean;
          name: string;
          starts_on: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_on: string;
          id?: string;
          is_current?: boolean;
          name: string;
          starts_on: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
          starts_on?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: boolean;
          night_end: string;
          night_start: string;
          secretary_email: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          night_end?: string;
          night_start?: string;
          secretary_email?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          night_end?: string;
          night_start?: string;
          secretary_email?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      weekly_blocks: {
        Row: {
          category: string;
          created_at: string;
          end_time: string;
          id: string;
          kind: string;
          label: string;
          location: string | null;
          member_id: string;
          semester_id: string;
          start_time: string;
          weekday: number;
        };
        Insert: {
          category?: string;
          created_at?: string;
          end_time: string;
          id?: string;
          kind: string;
          label: string;
          location?: string | null;
          member_id: string;
          semester_id: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          kind?: string;
          label?: string;
          location?: string | null;
          member_id?: string;
          semester_id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_blocks_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semesters";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _insert_items: {
        Args: {
          p_items: Json;
          p_kinds: string[];
          p_member_id: string;
          p_semester_id: string;
        };
        Returns: undefined;
      };
      apply_feed_sync: {
        Args: { p_items: Json; p_member_id: string; p_semester_id: string };
        Returns: number;
      };
      chapter_timezone: { Args: Record<PropertyKey, never>; Returns: string };
      create_event: {
        Args: { p: Json };
        Returns: {
          all_day: boolean;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string;
          hidden_from_associates: boolean;
          id: string;
          location: string | null;
          required: boolean;
          rsvp_enabled: boolean;
          series_id: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      expand_recurrence: {
        Args: {
          p_by_weekday: number[];
          p_count: number;
          p_freq: string;
          p_interval: number;
          p_start: string;
          p_until: string;
        };
        Returns: string[];
      };
      feed_events: {
        Args: { p_token: string };
        Returns: {
          all_day: boolean;
          category: string;
          category_label: string;
          description: string;
          ends_at: string;
          id: string;
          location: string;
          required: boolean;
          starts_at: string;
          title: string;
          updated_at: string;
        }[];
      };
      feed_token: { Args: { p_rotate?: boolean }; Returns: string };
      local_range: {
        Args: {
          p_all_day: boolean;
          p_date: string;
          p_end: string;
          p_span_days: number;
          p_start: string;
          p_tz: string;
        };
        Returns: Record<string, unknown>;
      };
      save_schedule_step: {
        Args: {
          p_blocks?: Json;
          p_canvas_url?: string;
          p_items?: Json;
          p_step: string;
        };
        Returns: {
          canvas_feed_url: string | null;
          canvas_sync_error: string | null;
          canvas_synced_at: string | null;
          classes_done_at: string | null;
          completed: boolean | null;
          exams_done_at: string | null;
          member_id: string;
          obligations_done_at: string | null;
          semester_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "schedule_submissions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_semester: {
        Args: { p_ends_on: string; p_name: string; p_starts_on: string };
        Returns: {
          created_at: string;
          created_by: string | null;
          ends_on: string;
          id: string;
          is_current: boolean;
          name: string;
          starts_on: string;
        };
        SetofOptions: {
          from: "*";
          to: "semesters";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submission_counts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          submitted: number;
          total: number;
        }[];
      };
      update_event: {
        Args: { p: Json; p_id: string; p_scope?: string };
        Returns: {
          all_day: boolean;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string;
          hidden_from_associates: boolean;
          id: string;
          location: string | null;
          required: boolean;
          rsvp_enabled: boolean;
          series_id: string | null;
          starts_at: string;
          title: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      members: {
        Row: {
          active: boolean;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          email: string;
          id: string;
          member_type: Database["public"]["Enums"]["member_type"];
          name: string;
          pledge_class: string | null;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email: string;
          id: string;
          member_type?: Database["public"]["Enums"]["member_type"];
          name?: string;
          pledge_class?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          member_type?: Database["public"]["Enums"]["member_type"];
          name?: string;
          pledge_class?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_update_member: {
        Args: {
          p_active?: boolean;
          p_member_id: string;
          p_member_type?: Database["public"]["Enums"]["member_type"];
          p_name?: string;
          p_pledge_class?: string;
          p_role?: Database["public"]["Enums"]["member_role"];
          p_status?: Database["public"]["Enums"]["member_status"];
        };
        Returns: {
          active: boolean;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          email: string;
          id: string;
          member_type: Database["public"]["Enums"]["member_type"];
          name: string;
          pledge_class: string | null;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "members";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_brother: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_member: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      member_role: "admin" | "member";
      member_status: "pending" | "approved" | "rejected";
      member_type: "brother" | "associate";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  calendar: {
    Enums: {},
  },
  public: {
    Enums: {
      member_role: ["admin", "member"],
      member_status: ["pending", "approved", "rejected"],
      member_type: ["brother", "associate"],
    },
  },
} as const;
