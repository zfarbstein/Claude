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
      attendance: {
        Row: {
          event_id: string;
          marked_at: string;
          marked_by: string | null;
          member_id: string;
          method: string;
          status: string;
        };
        Insert: {
          event_id: string;
          marked_at?: string;
          marked_by?: string | null;
          member_id: string;
          method: string;
          status: string;
        };
        Update: {
          event_id?: string;
          marked_at?: string;
          marked_by?: string | null;
          member_id?: string;
          method?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
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
      checkin_failures: {
        Row: {
          at: string;
          event_id: string;
          member_id: string;
        };
        Insert: {
          at?: string;
          event_id: string;
          member_id: string;
        };
        Update: {
          at?: string;
          event_id?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_failures_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      checkin_secrets: {
        Row: {
          event_id: string;
          secret: string;
        };
        Insert: {
          event_id: string;
          secret?: string;
        };
        Update: {
          event_id?: string;
          secret?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_secrets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
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
      excuses: {
        Row: {
          attachment_path: string | null;
          created_at: string;
          event_id: string;
          id: string;
          member_id: string;
          reason: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        Insert: {
          attachment_path?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          member_id: string;
          reason: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          attachment_path?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          member_id?: string;
          reason?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "excuses_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
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
      night_marks: {
        Row: {
          created_at: string;
          member_id: string;
          night: string;
          reason: string | null;
        };
        Insert: {
          created_at?: string;
          member_id: string;
          night: string;
          reason?: string | null;
        };
        Update: {
          created_at?: string;
          member_id?: string;
          night?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      notification_inbox: {
        Row: {
          created_at: string;
          emailed: boolean;
          member_id: string;
          notification_id: string;
          pushed: boolean;
          read_at: string | null;
        };
        Insert: {
          created_at?: string;
          emailed?: boolean;
          member_id: string;
          notification_id: string;
          pushed?: boolean;
          read_at?: string | null;
        };
        Update: {
          created_at?: string;
          emailed?: boolean;
          member_id?: string;
          notification_id?: string;
          pushed?: boolean;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_inbox_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          audience: string;
          body: string;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          dedupe_key: string | null;
          emailed: number | null;
          error: string | null;
          event_id: string | null;
          id: string;
          kind: string;
          member_ids: string[];
          pushed: number | null;
          recipients: number | null;
          send_at: string;
          sent_at: string | null;
          status: string;
          title: string;
          url: string;
        };
        Insert: {
          audience: string;
          body?: string;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          emailed?: number | null;
          error?: string | null;
          event_id?: string | null;
          id?: string;
          kind: string;
          member_ids?: string[];
          pushed?: number | null;
          recipients?: number | null;
          send_at?: string;
          sent_at?: string | null;
          status?: string;
          title: string;
          url?: string;
        };
        Update: {
          audience?: string;
          body?: string;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          emailed?: number | null;
          error?: string | null;
          event_id?: string | null;
          id?: string;
          kind?: string;
          member_ids?: string[];
          pushed?: number | null;
          recipients?: number | null;
          send_at?: string;
          sent_at?: string | null;
          status?: string;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          failure_count: number;
          id: string;
          last_success_at: string | null;
          member_id: string;
          p256dh: string;
          user_agent: string | null;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          failure_count?: number;
          id?: string;
          last_success_at?: string | null;
          member_id: string;
          p256dh: string;
          user_agent?: string | null;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          failure_count?: number;
          id?: string;
          last_success_at?: string | null;
          member_id?: string;
          p256dh?: string;
          user_agent?: string | null;
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
          email_fallback: boolean;
          excuse_attachment_required: boolean;
          excuses_enabled: boolean;
          id: boolean;
          night_end: string;
          night_start: string;
          reminders_enabled: boolean;
          secretary_email: string | null;
          timezone: string;
          updated_at: string;
          weekly_reminder_dow: number;
          weekly_reminder_enabled: boolean;
          weekly_reminder_time: string;
        };
        Insert: {
          email_fallback?: boolean;
          excuse_attachment_required?: boolean;
          excuses_enabled?: boolean;
          id?: boolean;
          night_end?: string;
          night_start?: string;
          reminders_enabled?: boolean;
          secretary_email?: string | null;
          timezone?: string;
          updated_at?: string;
          weekly_reminder_dow?: number;
          weekly_reminder_enabled?: boolean;
          weekly_reminder_time?: string;
        };
        Update: {
          email_fallback?: boolean;
          excuse_attachment_required?: boolean;
          excuses_enabled?: boolean;
          id?: boolean;
          night_end?: string;
          night_start?: string;
          reminders_enabled?: boolean;
          secretary_email?: string | null;
          timezone?: string;
          updated_at?: string;
          weekly_reminder_dow?: number;
          weekly_reminder_enabled?: boolean;
          weekly_reminder_time?: string;
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
      _checkin_code: {
        Args: { p_secret: string; p_window: number };
        Returns: string;
      };
      _checkin_window: { Args: Record<PropertyKey, never>; Returns: number };
      _insert_items: {
        Args: {
          p_items: Json;
          p_kinds: string[];
          p_member_id: string;
          p_semester_id: string;
        };
        Returns: undefined;
      };
      _night_statuses: {
        Args: { p_end: string; p_member?: string; p_start: string };
        Returns: {
          member_id: string;
          night: string;
          reasons: Json;
          status: string;
        }[];
      };
      _required_event_on_night: {
        Args: { p_night: string };
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
        };
        SetofOptions: {
          from: "*";
          to: "events";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_feed_sync: {
        Args: { p_items: Json; p_member_id: string; p_semester_id: string };
        Returns: number;
      };
      attendance_report: {
        Args: { p_categories?: string[]; p_from: string; p_to: string };
        Returns: Json;
      };
      cancel_notification: { Args: { p_id: string }; Returns: undefined };
      chapter_timezone: { Args: Record<PropertyKey, never>; Returns: string };
      check_in: { Args: { p_code: string; p_event_id: string }; Returns: Json };
      checkin_code: {
        Args: { p_event_id: string };
        Returns: {
          closes_at: string;
          code: string;
          expires_at: string;
          opens_at: string;
        }[];
      };
      claim_due_notifications: {
        Args: { p_limit?: number };
        Returns: {
          audience: string;
          body: string;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          dedupe_key: string | null;
          emailed: number | null;
          error: string | null;
          event_id: string | null;
          id: string;
          kind: string;
          member_ids: string[];
          pushed: number | null;
          recipients: number | null;
          send_at: string;
          sent_at: string | null;
          status: string;
          title: string;
          url: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "notifications";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
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
      delete_push_subscription: {
        Args: { p_endpoint: string };
        Returns: undefined;
      };
      event_roster: {
        Args: { p_event_id: string };
        Returns: {
          excuse_status: string;
          marked_at: string;
          member_id: string;
          member_type: Database["public"]["Enums"]["member_type"];
          method: string;
          name: string;
          pledge_class: string;
          status: string;
        }[];
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
      mark_inbox_read: {
        Args: { p_notification_ids?: string[] };
        Returns: undefined;
      };
      member_nights: {
        Args: { p_end: string; p_member: string; p_start: string };
        Returns: {
          mark_reason: string;
          marked: boolean;
          night: string;
          reasons: Json;
          required_event_id: string;
          required_event_title: string;
          status: string;
        }[];
      };
      member_schedule: { Args: { p_member: string }; Returns: Json };
      night_detail: {
        Args: { p_night: string };
        Returns: {
          member_id: string;
          member_type: Database["public"]["Enums"]["member_type"];
          name: string;
          reasons: Json;
          status: string;
        }[];
      };
      night_summary: {
        Args: { p_end: string; p_start: string };
        Returns: {
          busy: number;
          free: number;
          night: string;
          total: number;
          unknown: number;
        }[];
      };
      notification_recipients: {
        Args: { p_notification_id: string };
        Returns: {
          email: string;
          member_id: string;
          name: string;
        }[];
      };
      open_checkins: {
        Args: Record<PropertyKey, never>;
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
      queue_due_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      review_excuse: {
        Args: { p_approve: boolean; p_excuse_id: string; p_note?: string };
        Returns: {
          attachment_path: string | null;
          created_at: string;
          event_id: string;
          id: string;
          member_id: string;
          reason: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "excuses";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_push_subscription: {
        Args: {
          p_auth: string;
          p_endpoint: string;
          p_p256dh: string;
          p_user_agent?: string;
        };
        Returns: undefined;
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
      send_notification: {
        Args: {
          p_audience: string;
          p_body: string;
          p_member_ids?: string[];
          p_send_at?: string;
          p_title: string;
          p_url?: string;
        };
        Returns: {
          audience: string;
          body: string;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          dedupe_key: string | null;
          emailed: number | null;
          error: string | null;
          event_id: string | null;
          id: string;
          kind: string;
          member_ids: string[];
          pushed: number | null;
          recipients: number | null;
          send_at: string;
          sent_at: string | null;
          status: string;
          title: string;
          url: string;
        };
        SetofOptions: {
          from: "*";
          to: "notifications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_attendance: {
        Args: { p_event_id: string; p_member_id: string; p_status: string };
        Returns: undefined;
      };
      set_night_mark: {
        Args: { p_night: string; p_reason?: string; p_unavailable: boolean };
        Returns: undefined;
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
      submit_excuse: {
        Args: {
          p_attachment_path?: string;
          p_event_id: string;
          p_reason: string;
        };
        Returns: {
          attachment_path: string | null;
          created_at: string;
          event_id: string;
          id: string;
          member_id: string;
          reason: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "excuses";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      hub_apps: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          name: string;
          sort_order: number;
          url: string;
        };
        Insert: {
          created_at?: string;
          icon?: string;
          id?: string;
          name: string;
          sort_order?: number;
          url: string;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          url?: string;
        };
        Relationships: [];
      };
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
