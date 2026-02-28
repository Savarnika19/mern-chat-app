import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text } from "@chakra-ui/layout";
import "./styles.css";
import { IconButton, Spinner, useToast, Button, useDisclosure } from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import Lottie from "react-lottie";
import animationData from "../animations/typing.json";

import io from "socket.io-client";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import SummarizeModal from "./miscellaneous/SummarizeModal";
import { ChatState } from "../Context/ChatProvider";
import { motion } from "framer-motion"; // Import motion
const ENDPOINT = "http://localhost:5000"; // "https://talk-a-tive.herokuapp.com"; -> After deployment
var socket, selectedChatCompare;

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);


  // Summarization State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [summary, setSummary] = useState("");
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const { isOpen: isSummarizeOpen, onOpen: onSummarizeOpen, onClose: onSummarizeClose } = useDisclosure();

  const toast = useToast();

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  const { selectedChat, setSelectedChat, user, notification, setNotification, scrollToMessage, setScrollToMessage } =
    ChatState();

  const fetchMessages = async () => {
    if (!selectedChat) return;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      setLoading(true);

      const { data } = await axios.get(
        `/api/message/${selectedChat._id}`,
        config
      );
      setMessages(data);
      setLoading(false);

      socket.emit("join chat", selectedChat._id);
    } catch (error) {
      toast({
        title: "Error Occured!",
        description: "Failed to Load the Messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage) {
      socket.emit("stop typing", selectedChat._id);
      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };
        setNewMessage("");
        const { data } = await axios.post(
          "/api/message",
          {
            content: newMessage,
            chatId: selectedChat,
          },
          config
        );
        socket.emit("new message", data);
        setMessages([...messages, data]);
      } catch (error) {
        toast({
          title: "Error Occured!",
          description: "Failed to send the Message",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    }
  };

  useEffect(() => {
    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));

    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    fetchMessages();

    selectedChatCompare = selectedChat;
    // eslint-disable-next-line
  }, [selectedChat]);

  useEffect(() => {
    const handleMessageReceived = (newMessageRecieved) => {
      if (
        !selectedChatCompare ||
        selectedChatCompare._id !== newMessageRecieved.chat._id
      ) {
        if (!notification.some(n => n._id === newMessageRecieved._id)) {
          setNotification([newMessageRecieved, ...notification]);
          setFetchAgain(!fetchAgain);
        }
      } else {
        setMessages([...messages, newMessageRecieved]);
      }
    };

    socket.on("message recieved", handleMessageReceived);

    return () => {
      socket.off("message recieved", handleMessageReceived);
    };
  });

  const typingHandler = (e) => {
    setNewMessage(e.target.value);

    if (!socketConnected) return;

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  const handleSelectMessage = (messageId) => {
    if (selectedMessages.includes(messageId)) {
      setSelectedMessages(selectedMessages.filter((id) => id !== messageId));
    } else {
      setSelectedMessages([...selectedMessages, messageId]);
    }
  };

  const handleSummarize = async (type) => {
    setSummarizeLoading(true);
    onSummarizeOpen();
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      const payload = type === "unread" ? { chatId: selectedChat._id } : { messageIds: selectedMessages };

      const { data } = await axios.post("/api/message/summarize", payload, config);
      setSummary(data.summary);
      setSummarizeLoading(false);

      // Reset selection mode if used
      if (type === "selected") {
        setIsSelectionMode(false);
        setSelectedMessages([]);
      }
    } catch (error) {
      setSummary("Error generating summary.");
      setSummarizeLoading(false);
      toast({
        title: "Error",
        description: "Failed to generate summary",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  const handleDelete = async () => {
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      await axios.post("/api/message/delete", { messageIds: selectedMessages }, config);

      // Remove from local state
      setMessages(messages.filter(m => !selectedMessages.includes(m._id)));
      setSelectedMessages([]);
      setIsSelectionMode(false);
      toast({
        title: "Success",
        description: "Messages deleted",
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  // Check for unreads (naive check: messages not read by me)
  const hasUnreadMessages = messages && messages.some(m => !m.readBy.includes(user._id) && m.sender._id !== user._id);

  const handleDeleteChat = async () => {
    if (!window.confirm("Are you sure you want to delete this chat?")) return;
    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };
      await axios.delete(`/api/chat/${selectedChat._id}`, config);

      setSelectedChat(null);
      setFetchAgain(!fetchAgain);
      toast({ title: "Chat Deleted", status: "success", duration: 3000, isClosable: true, position: "bottom" });
    } catch (error) {
      toast({ title: "Error Deleting Chat", description: error.message, status: "error", duration: 3000, isClosable: true, position: "bottom" });
    }
  };

  return (
    <>
      {selectedChat ? (
        <>
          <Text
            fontSize={{ base: "28px", md: "30px" }}
            pb={3}
            px={2}
            w="100%"
            fontFamily="Outfit"
            d="flex"
            justifyContent={{ base: "space-between" }}
            alignItems="center"
            color="white"
            fontWeight="bold"
            style={{ textShadow: "0 2px 4px rgba(0,0,0,0.2)" }}
          >
            <IconButton
              d={{ base: "flex", md: "none" }}
              icon={<ArrowBackIcon />}
              onClick={() => setSelectedChat("")}
            />
            {messages &&
              (!selectedChat.isGroupChat ? (
                <>
                  {getSender(user, selectedChat.users)}
                  <ProfileModal
                    user={getSenderFull(user, selectedChat.users)}
                  />
                  <IconButton
                    d={{ base: "flex" }}
                    icon={<i className="fas fa-trash"></i>} // FontAwesome trash icon or import from chakra
                    colorScheme="red"
                    size="sm"
                    ml={2}
                    onClick={() => handleDeleteChat()}
                  />
                </>
              ) : (
                <>
                  {selectedChat.chatName.toUpperCase()}
                  <UpdateGroupChatModal
                    fetchMessages={fetchMessages}
                    fetchAgain={fetchAgain}
                    setFetchAgain={setFetchAgain}
                  />
                </>
              ))}
          </Text>

          {/* Summarization Controls */}
          <Box d="flex" pb={2} justifyContent="flex-end">
            {hasUnreadMessages && !isSelectionMode && (
              <Button size="xs" colorScheme="purple" mr={2} onClick={() => handleSummarize("unread")}>
                Summarize Unread
              </Button>
            )}
            {!isSelectionMode ? (
              <Button size="xs" onClick={() => setIsSelectionMode(true)}>
                Select Messages
              </Button>
            ) : (
              <>
                <Button size="xs" colorScheme="teal" mr={2} onClick={() => handleSummarize("selected")} disabled={selectedMessages.length === 0}>
                  Summarize ({selectedMessages.length})
                </Button>
                <Button size="xs" colorScheme="red" mr={2} onClick={handleDelete} disabled={selectedMessages.length === 0}>
                  Delete
                </Button>
                <Button size="xs" onClick={() => { setIsSelectionMode(false); setSelectedMessages([]); }}>
                  Cancel
                </Button>
              </>
            )}
          </Box>

          <Box
            d="flex"
            flexDir="column"
            justifyContent="flex-end"
            p={3}
            bg="rgba(255, 255, 255, 0.6)"
            w="100%"
            flex={1}
            borderRadius="xl"
            overflowY="hidden"
            backdropFilter="blur(10px)"
            boxShadow="inset 0 0 20px rgba(255,255,255,0.5)"
          >
            {loading ? (
              <Spinner
                size="xl"
                w={20}
                h={20}
                alignSelf="center"
                margin="auto"
              />
            ) : (
              <div className="messages">
                <ScrollableChat
                  messages={messages}
                  isSelectionMode={isSelectionMode}
                  selectedMessages={selectedMessages}
                  onSelectMessage={handleSelectMessage}
                  scrollToMessage={scrollToMessage}
                  setScrollToMessage={setScrollToMessage}
                />
              </div>
            )}

            <FormControl
              onKeyDown={sendMessage}
              id="first-name"
              isRequired
              mt={3}
            >
              {istyping ? (
                <div>
                  <Lottie
                    options={defaultOptions}
                    // height={50}
                    width={70}
                    style={{ marginBottom: 15, marginLeft: 0 }}
                  />
                </div>
              ) : (
                <></>
              )}
              <Input
                variant="filled"
                bg="#E0E0E0"
                placeholder="Enter a message.."
                value={newMessage}
                onChange={typingHandler}
              />
            </FormControl>
          </Box>
        </>
      ) : (
        // to get socket.io on same page
        <Box d="flex" alignItems="center" justifyContent="center" h="100%">
          <Text fontSize="3xl" pb={3} fontFamily="Work sans">
            Click on a user to start chatting
          </Text>
        </Box>
      )}
      <SummarizeModal isOpen={isSummarizeOpen} onClose={onSummarizeClose} summary={summary} loading={summarizeLoading} />
    </>
  );
};

export default SingleChat;
