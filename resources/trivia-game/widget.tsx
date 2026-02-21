import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import "../styles.css";

const SUPABASE_URL = "https://hcddekcllbhiiazrcmhi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZGRla2NsbGJoaWlhenJjbWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDY1NzcsImV4cCI6MjA4NzI4MjU3N30.PxcMSJuqIl8FbHbrkdfI8qsn4JocLPrCAM5TN7ZYYlo";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const questionSchema = z.object({
  id: z.string().optional(),
  question_text: z.string(),
  options: z.array(z.string()),
  correct_index: z.number(),
  order_index: z.number().optional(),
  fun_fact: z.string().optional(),
});

const playerSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  score: z.number(),
});

const propSchema = z.object({
  gameId: z.string(),
  joinCode: z.string(),
  title: z.string(),
  status: z.string(),
  currentQuestion: z.number(),
  totalQuestions: z.number(),
  currentQuestionData: questionSchema.nullable().optional(),
  players: z.array(playerSchema),
  leaderboard: z.array(playerSchema),
  playBaseUrl: z.string().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Trivia game host view with QR code join, live leaderboard, and real-time player answers",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    csp: {
      connectDomains: [
        "https://hcddekcllbhiiazrcmhi.supabase.co",
        "wss://hcddekcllbhiiazrcmhi.supabase.co",
      ],
      resourceDomains: [
        "https://api.qrserver.com",
      ],
    },
    autoResize: true,
  },
};

type Props = z.infer<typeof propSchema>;

const TriviaGame: React.FC = () => {
  const { props, isPending, theme, sendFollowUpMessage } = useWidget<Props>();
  const isDark = theme === "dark";
  const [players, setPlayers] = useState<z.infer<typeof playerSchema>[]>([]);
  const [answerCount, setAnswerCount] = useState(0);

  useEffect(() => {
    if (props?.players) setPlayers(props.players);
  }, [props?.players]);

  // Subscribe to realtime player joins and answers
  useEffect(() => {
    if (!props?.gameId) return;

    const channel = sb
      .channel(`game-${props.gameId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "players",
        filter: `game_id=eq.${props.gameId}`,
      }, (payload) => {
        setPlayers(prev => [...prev, payload.new as any]);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "players",
        filter: `game_id=eq.${props.gameId}`,
      }, (payload) => {
        setPlayers(prev => prev.map(p => p.id === (payload.new as any).id ? payload.new as any : p));
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "answers",
      }, () => {
        setAnswerCount(prev => prev + 1);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [props?.gameId]);

  // Reset answer count when question changes
  useEffect(() => {
    setAnswerCount(0);
  }, [props?.currentQuestion]);

  if (isPending || !props) {
    return (
      <McpUseProvider autoSize>
        <div className={`p-8 rounded-2xl ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
          <div className="animate-pulse space-y-4">
            <div className={`h-8 w-64 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-48 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const bg = isDark ? "bg-gray-900" : "bg-white";
  const cardBg = isDark ? "bg-gray-800" : "bg-gray-50";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-500";

  const baseUrl = props.playBaseUrl || "https://ayushkumarcode.github.io/flexpy";
  const playUrl = `${baseUrl}/play.html?join=${props.joinCode}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=svg&data=${encodeURIComponent(playUrl)}`;

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <McpUseProvider autoSize viewControls="fullscreen">
      <div className={`${bg} rounded-2xl p-6 min-w-[500px]`}>
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className={`text-3xl font-bold ${textPrimary}`}>{props.title}</h1>
          <p className={`text-sm mt-1 ${textSecondary}`}>
            {props.status === "waiting" ? "Waiting for players..." :
             props.status === "finished" ? "Game Over!" :
             `Question ${props.currentQuestion + 1} of ${props.totalQuestions}`}
          </p>
        </div>

        {/* Waiting State - QR Code + Player List */}
        {props.status === "waiting" && (
          <div className="flex flex-col items-center gap-6">
            <div className={`${cardBg} rounded-xl p-6 text-center`}>
              <img src={qrUrl} alt="Join QR Code" className="w-48 h-48 mx-auto mb-4 rounded-lg" />
              <p className={`font-mono text-2xl font-bold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                {props.joinCode}
              </p>
              <p className={`text-xs mt-2 ${textSecondary}`}>Scan QR or visit the URL to join</p>
            </div>

            <div className={`w-full ${cardBg} rounded-xl p-4`}>
              <h3 className={`font-semibold mb-3 ${textPrimary}`}>
                Players ({players.length})
              </h3>
              {players.length === 0 ? (
                <p className={`text-sm text-center py-2 ${textSecondary}`}>No players yet...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {players.map((p, i) => (
                    <span key={p.id || i} className="px-3 py-1.5 bg-indigo-600 text-white rounded-full text-sm font-medium">
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => sendFollowUpMessage?.(`Start the game ${props.gameId}`)}
              className="px-8 py-3 bg-green-600 text-white rounded-xl text-lg font-bold hover:bg-green-700 transition-colors"
            >
              Start Game ({players.length} players)
            </button>
          </div>
        )}

        {/* Active State - Current Question + Leaderboard */}
        {props.status === "active" && props.currentQuestionData && (
          <div className="space-y-6">
            <div className={`${cardBg} rounded-xl p-6`}>
              <h2 className={`text-xl font-bold mb-4 ${textPrimary}`}>
                {props.currentQuestionData.question_text}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {props.currentQuestionData.options.map((opt, i) => {
                  const colors = [
                    "bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500"
                  ];
                  return (
                    <div key={i} className={`${colors[i]} text-white rounded-lg p-4 text-center font-semibold`}>
                      {opt}
                    </div>
                  );
                })}
              </div>
              <div className={`mt-4 text-center ${textSecondary}`}>
                <p className="text-sm">{answerCount} of {players.length} answered</p>
              </div>
            </div>

            {/* Leaderboard */}
            <div className={`${cardBg} rounded-xl p-4`}>
              <h3 className={`font-semibold mb-3 ${textPrimary}`}>Leaderboard</h3>
              <div className="space-y-2">
                {sortedPlayers.map((p, i) => (
                  <div key={p.id || i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${i === 0 ? (isDark ? "bg-yellow-900/30" : "bg-yellow-50") : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-500 text-white" : i === 1 ? "bg-gray-400 text-white" : i === 2 ? "bg-orange-600 text-white" : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")}`}>
                        {i + 1}
                      </span>
                      <span className={`font-medium ${textPrimary}`}>{p.name}</span>
                    </div>
                    <span className={`font-bold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{p.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => sendFollowUpMessage?.(`Next question for game ${props.gameId}`)}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl text-lg font-bold hover:bg-indigo-700 transition-colors"
            >
              Next Question
            </button>
          </div>
        )}

        {/* Finished State - Final Leaderboard */}
        {props.status === "finished" && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <span className="text-6xl">🏆</span>
              <h2 className={`text-2xl font-bold mt-4 ${textPrimary}`}>
                {sortedPlayers[0]?.name || "Nobody"} Wins!
              </h2>
              <p className={`${textSecondary}`}>with {sortedPlayers[0]?.score || 0} points</p>
            </div>

            <div className={`${cardBg} rounded-xl p-4`}>
              <h3 className={`font-semibold mb-3 ${textPrimary}`}>Final Standings</h3>
              <div className="space-y-2">
                {sortedPlayers.map((p, i) => (
                  <div key={p.id || i} className={`flex items-center justify-between py-3 px-4 rounded-lg ${i === 0 ? (isDark ? "bg-yellow-900/30 border border-yellow-700" : "bg-yellow-50 border border-yellow-200") : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                      <span className={`font-semibold ${textPrimary}`}>{p.name}</span>
                    </div>
                    <span className={`font-bold text-lg ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>{p.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </McpUseProvider>
  );
};

export default TriviaGame;
