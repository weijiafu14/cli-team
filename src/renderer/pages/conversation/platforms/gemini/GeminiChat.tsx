import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache, useMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { dispatchChatMessageJump } from '@renderer/utils/chat/chatMinimapEvents';
import HOC from '@renderer/utils/ui/HOC';
import React, { useEffect, useMemo, useRef } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import GeminiSendBox from './GeminiSendBox';
import type { GeminiModelSelection } from './useGeminiModelSelection';

// Wrapper component to handle Gemini-specific auto-scroll and UI enhancements
const GeminiSpecificBehaviors: React.FC<{ conversation_id: string; children: React.ReactNode }> = ({
  conversation_id,
  children,
}) => {
  const messages = useMessageList();
  const prevLengthRef = useRef(0);

  // Custom scroll-to-bottom logic specifically for Gemini, avoiding global useAutoScroll changes
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      // Only trigger jump if new message was added
      // Using the global jump event ensures we interact cleanly with the existing MessageList
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        setTimeout(() => {
          dispatchChatMessageJump({
            conversationId: conversation_id,
            messageId: lastMessage.id,
            align: 'end',
            behavior: 'smooth',
          });
        }, 50); // slight delay to allow DOM to render
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages, conversation_id]);

  return (
    <div className='gemini-custom-ui-wrapper flex-1 flex flex-col h-full bg-base-2 rounded-2xl p-4 overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm mx-4 mt-4'>
      {/* Injecting scoped styles here to avoid global CSS contamination */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
         .gemini-custom-ui-wrapper .message-item {
           max-width: 85% !important;
         }
         .gemini-custom-ui-wrapper .message-item.right > div {
            background-color: var(--color-bg-3);
            border-radius: 12px 12px 0 12px;
         }
         .gemini-custom-ui-wrapper .message-item.left > div {
            background-color: var(--color-fill-2);
            border-radius: 12px 12px 12px 0;
         }
       `,
        }}
      />
      {children}
    </div>
  );
};

const GeminiChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: GeminiModelSelection;
}> = ({ conversation_id, workspace, modelSelection }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'gemini' };
  }, [conversation_id, workspace]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className='flex-1 flex flex-col px-20px min-h-0 bg-base'>
        <GeminiSpecificBehaviors conversation_id={conversation_id}>
          <FlexFullContainer>
            <MessageList className='flex-1'></MessageList>
          </FlexFullContainer>
        </GeminiSpecificBehaviors>
        <div className='px-4 pb-4'>
          <ConversationChatConfirm conversation_id={conversation_id}>
            <GeminiSendBox conversation_id={conversation_id} modelSelection={modelSelection}></GeminiSendBox>
          </ConversationChatConfirm>
        </div>
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(GeminiChat);
