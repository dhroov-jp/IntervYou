"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback, createInterview } from "@/lib/actions/general.action";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [currentInterviewId, setCurrentInterviewId] = useState<string | undefined>(interviewId);

  useEffect(() => {
    const onCallStart = () => {
      console.log("✅ [Call Event] Call started successfully");
      setCallStatus(CallStatus.ACTIVE);
    };

    const onCallEnd = () => {
      console.log("📞 [Call Event] Call ended");
      setCallStatus(CallStatus.FINISHED);
    };

    const onMessage = (message: Message) => {
      console.log("💬 [Message Event]:", message);
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { role: message.role, content: message.transcript };
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const onSpeechStart = () => {
      console.log("speech start");
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      console.log("speech end");
      setIsSpeaking(false);
    };

    const onError = (error: any) => {
      console.error("❌ [Vapi Error Event]:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      
      // Show user-friendly alert
      let errorMsg = "Call error occurred. ";
      if (error?.message) errorMsg += error.message;
      if (error?.error?.message) errorMsg += error.error.message;
      alert(errorMsg + " Check console for details.");
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback");

      const { success, feedbackId: id } = await createFeedback({
        interviewId: currentInterviewId!,
        userId: userId!,
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${currentInterviewId}/feedback`);
      } else {
        console.log("Error saving feedback");
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        // For generated interviews, just go to homepage after call ends
        if (currentInterviewId && messages.length > 0) {
          // Interview was created and had conversation, generate feedback
          handleGenerateFeedback(messages);
        } else {
          router.push("/");
        }
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, currentInterviewId, router, type, userId]);

  const handleCall = async () => {
    try {
      setCallStatus(CallStatus.CONNECTING);
      console.log("[Call] Initiating call flow...");
      console.log("[Call] Token:", process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN?.substring(0, 10) + "...");
      console.log("[Call] Workflow ID:", process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID);
      console.log("[Call] Type:", type);
      console.log("[Call] Username:", userName);
      console.log("[Call] UserId:", userId);

      // Request microphone permission first
      try {
        console.log("[Call] Requesting microphone permission...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("✅ [Call] Microphone permission granted");
        // Stop the tracks immediately after permission is granted
        stream.getTracks().forEach(track => track.stop());
      } catch (micError: any) {
        console.error("❌ [Call] Microphone permission denied:", micError);
        alert("Microphone permission is required to start the interview. Please allow access and try again.");
        setCallStatus(CallStatus.INACTIVE);
        return;
      }

      if (type === "generate") {
        console.log("[Call] Generate interview flow starting...");
        console.log("[Call] UserId:", userId);
        
        if (!userId) {
          console.error("[Call] No userId provided");
          alert("You must be logged in to start an interview. Please sign in.");
          setCallStatus(CallStatus.INACTIVE);
          return;
        }

        const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
        console.log("[Call] Assistant ID:", assistantId?.substring(0, 10) + "...");
        
        if (!assistantId || assistantId === "PUT_YOUR_ASSISTANT_ID_HERE") {
          console.error("[Call] Missing assistant ID");
          alert(
            "Assistant configuration error. Please contact support."
          );
          setCallStatus(CallStatus.INACTIVE);
          return;
        }

        console.log("[Call] Creating interview record...");
        try {
          const result = await createInterview({
            userId: userId!,
            role: "AI Generated Interview",
            type: "Generated",
          });

          console.log("[Call] createInterview result:", result);

          if (!result || !result.success || !result.interviewId) {
            console.error("[Call] Interview creation failed:", result);
            alert("Failed to create interview. Please check your connection and try again.");
            setCallStatus(CallStatus.INACTIVE);
            return;
          }

          console.log("[Call] Interview created with ID:", result.interviewId);
          setCurrentInterviewId(result.interviewId);

          console.log("[Call] Starting Vapi call with assistant ID:", assistantId.substring(0, 10) + "...");

          await vapi.start(assistantId);
          
          console.log("[Call] vapi.start() call completed successfully");
        } catch (createError: any) {
          console.error("[Call] Error during interview creation:", createError);
          alert(`Failed to create interview: ${createError?.message || "Unknown error"}`);
          setCallStatus(CallStatus.INACTIVE);
          return;
        }
      } else {
        let formattedQuestions = "";
        if (questions) {
          formattedQuestions = questions
            .map((question) => `- ${question}`)
            .join("\n");
        }

        console.log("[Call] Starting interview with assistant");
        await vapi.start(interviewer, {
          variableValues: {
            questions: formattedQuestions,
          },
        });
        
        console.log("[Call] vapi.start() call completed");
      }
    } catch (error: any) {
      console.error("❌ [Call] EXCEPTION CAUGHT:");
      console.error("[Call] Error:", error);
      console.error("[Call] Error message:", error?.message);
      console.error("[Call] Error stack:", error?.stack);
      
      // Try to get more details from the error
      if (error?.response) {
        console.error("[Call] Error has response object");
        try {
          const text = await error.response.text();
          console.error("[Call] Response text:", text);
        } catch (e) {
          console.error("[Call] Could not read response text");
        }
      }
      
      alert(
        `Could not start the call. ${
          error?.message || "Check console for details."
        }`
      );
      setCallStatus(CallStatus.INACTIVE);
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    vapi.stop();
  };

  return (
    <>
      <div className="call-view">
        {/* AI Interviewer Card */}
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        {/* User Profile Card */}
        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== "ACTIVE" ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== "CONNECTING" && "hidden"
              )}
            />

            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={() => handleDisconnect()}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
