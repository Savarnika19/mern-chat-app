import { useEffect } from "react";
import { Avatar } from "@chakra-ui/avatar";
import { Tooltip } from "@chakra-ui/tooltip";
import ScrollableFeed from "react-scrollable-feed";
import {
  isLastMessage,
  isSameSender,
  isSameSenderMargin,
  isSameUser,
} from "../config/ChatLogics";
import { ChatState } from "../Context/ChatProvider";
import { motion, AnimatePresence } from "framer-motion";

const ScrollableChat = ({
  messages,
  isSelectionMode,
  selectedMessages,
  onSelectMessage,
  scrollToMessage,
  setScrollToMessage
}) => {
  const { user } = ChatState();

  useEffect(() => {
    if (scrollToMessage && messages) {
      const element = document.getElementById(`msg-${scrollToMessage}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add("highlight-message");
        setTimeout(() => {
          element.classList.remove("highlight-message");
          setScrollToMessage(null);
        }, 2000);
      }
    }
  }, [scrollToMessage, messages, setScrollToMessage]);

  return (
    <ScrollableFeed>
      <AnimatePresence>
        {messages &&
          messages.map((m, i) => (
            <motion.div
              style={{ display: "flex" }}
              key={m._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {(isSameSender(messages, m, i, user._id) ||
                isLastMessage(messages, i, user._id)) && (
                  <Tooltip label={m.sender.name} placement="bottom-start" hasArrow>
                    <Avatar
                      mt="7px"
                      mr={1}
                      size="sm"
                      cursor="pointer"
                      name={m.sender.name}
                      src={m.sender.pic}
                    />
                  </Tooltip>
                )}
              <span
                id={`msg-${m._id}`}
                style={{
                  background: m.sender._id === user._id
                    ? "linear-gradient(to right, #8e2de2, #4a00e0)" // Premium Purple Gradient
                    : "white",
                  color: m.sender._id === user._id ? "white" : "black",
                  marginLeft: isSameSenderMargin(messages, m, i, user._id),
                  marginTop: isSameUser(messages, m, i, user._id) ? 3 : 10,
                  borderRadius: "20px",
                  padding: "8px 18px",
                  maxWidth: "75%",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                  cursor: isSelectionMode ? "pointer" : "default",
                  border:
                    isSelectionMode && selectedMessages.includes(m._id)
                      ? "2px solid #38B2AC"
                      : "none",
                  fontWeight: "500"
                }}
                onClick={() => {
                  if (isSelectionMode) onSelectMessage(m._id);
                }}
              >
                {m.content}
              </span>
            </motion.div>
          ))}
      </AnimatePresence>
    </ScrollableFeed>
  );
};

export default ScrollableChat;
