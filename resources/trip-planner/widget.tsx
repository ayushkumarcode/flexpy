// @ts-nocheck
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import "../styles.css";

const SUPABASE_URL = "https://hcddekcllbhiiazrcmhi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZGRla2NsbGJoaWlhenJjbWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDY1NzcsImV4cCI6MjA4NzI4MjU3N30.PxcMSJuqIl8FbHbrkdfI8qsn4JocLPrCAM5TN7ZYYlo";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const memberSchema = z.object({
  name: z.string(),
  color: z.string(),
});

const itemSchema = z.object({
  id: z.string().optional(),
  board_id: z.string().optional(),
  column_name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  added_by: z.string(),
  added_by_color: z.string().optional(),
  votes_up: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  link: z.string().optional(),
  created_at: z.string().optional(),
});

const propSchema = z.object({
  boardId: z.string(),
  shareCode: z.string(),
  title: z.string(),
  columns: z.array(z.string()),
  items: z.array(itemSchema),
  members: z.array(memberSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Collaborative board for trip planning, gift brainstorming, and group decisions",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    csp: {
      connectDomains: [
        "https://hcddekcllbhiiazrcmhi.supabase.co",
        "wss://hcddekcllbhiiazrcmhi.supabase.co",
      ],
    },
    autoResize: true,
  },
};

type Props = z.infer<typeof propSchema>;
type Item = z.infer<typeof itemSchema>;

const TripPlanner: React.FC = () => {
  const { props, isPending, theme, sendFollowUpMessage } = useWidget<Props>();
  const isDark = theme === "dark";
  const [items, setItems] = useState<Item[]>([]);
  const [members, setMembers] = useState<z.infer<typeof memberSchema>[]>([]);

  // Initialize from props
  useEffect(() => {
    if (props?.items) setItems(props.items);
    if (props?.members) setMembers(props.members);
  }, [props?.items, props?.members]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!props?.boardId) return;

    const channel = sb
      .channel(`board-${props.boardId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "items",
        filter: `board_id=eq.${props.boardId}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setItems(prev => [...prev, payload.new as Item]);
        } else if (payload.eventType === "UPDATE") {
          setItems(prev => prev.map(i => i.id === (payload.new as any).id ? payload.new as Item : i));
        } else if (payload.eventType === "DELETE") {
          setItems(prev => prev.filter(i => i.id !== (payload.old as any).id));
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "members",
        filter: `board_id=eq.${props.boardId}`,
      }, (payload) => {
        setMembers(prev => [...prev, payload.new as any]);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [props?.boardId]);

  if (isPending || !props) {
    return (
      <McpUseProvider autoSize>
        <div className={`p-8 rounded-2xl ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
          <div className="animate-pulse space-y-4">
            <div className={`h-6 w-48 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-32 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const groupedItems = props.columns.reduce((acc, col) => {
    acc[col] = items.filter(i => i.column_name === col);
    return acc;
  }, {} as Record<string, Item[]>);

  const bg = isDark ? "bg-gray-900" : "bg-white";
  const cardBg = isDark ? "bg-gray-800" : "bg-gray-50";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-500";
  const border = isDark ? "border-gray-700" : "border-gray-200";

  return (
    <McpUseProvider autoSize viewControls="fullscreen">
      <div className={`${bg} rounded-2xl p-6 min-w-[600px]`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${textPrimary}`}>{props.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-sm font-mono px-2 py-1 rounded ${isDark ? "bg-gray-800 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}>
                {props.shareCode}
              </span>
              <div className="flex -space-x-2">
                {members.map((m, i) => (
                  <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900"
                    style={{ backgroundColor: m.color }}
                    title={m.name}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className={`text-sm ${textSecondary}`}>{members.length} collaborator{members.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button
            onClick={() => sendFollowUpMessage?.(`Analyze and compare all the options on board ${props.boardId}. What's the best combination?`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            AI Compare
          </button>
        </div>

        {/* Columns */}
        <div className="flex gap-4 overflow-x-auto pb-2">
          {props.columns.map(col => (
            <div key={col} className={`flex-1 min-w-[220px] rounded-xl ${cardBg} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-semibold ${textPrimary}`}>{col}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}>
                  {groupedItems[col]?.length || 0}
                </span>
              </div>
              <div className="space-y-3">
                {(groupedItems[col] || []).map((item, idx) => (
                  <div key={item.id || idx} className={`${bg} rounded-lg p-3 border ${border} transition-all hover:shadow-md`}>
                    <div className="flex items-start justify-between">
                      <h4 className={`font-medium text-sm ${textPrimary}`}>{item.title}</h4>
                      {(item.votes_up || 0) > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          +{item.votes_up}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className={`text-xs mt-1 ${textSecondary}`}>{item.description}</p>
                    )}
                    {item.metadata && (item.metadata as any).price && (
                      <span className={`text-sm font-semibold mt-2 inline-block ${isDark ? "text-green-400" : "text-green-600"}`}>
                        ${(item.metadata as any).price}
                      </span>
                    )}
                    {item.metadata && (item.metadata as any).recommended && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full ml-2">
                        Recommended
                      </span>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full text-[8px] flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: item.added_by_color || "#6366f1" }}>
                          {item.added_by?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className={`text-xs ${textSecondary}`}>{item.added_by}</span>
                      </div>
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-indigo-500 hover:underline">
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {(!groupedItems[col] || groupedItems[col].length === 0) && (
                  <p className={`text-xs text-center py-4 ${textSecondary}`}>No items yet</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </McpUseProvider>
  );
};

export default TripPlanner;
