import { useRef, useState, useEffect } from "react";
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerHeader,
    DrawerOverlay,
    DrawerCloseButton,
    Box,
    Text,
    Button,
    Stack,
    Badge,
    Spinner,
    useToast,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel
} from "@chakra-ui/react";
import { ChatState } from "../Context/ChatProvider";
import axios from "axios";
import { useHistory } from "react-router-dom";

const GlobalDeadlineDrawer = ({ isOpen, onClose }) => {
    const [pendingDeadlines, setPendingDeadlines] = useState([]);
    const [completedDeadlines, setCompletedDeadlines] = useState([]);
    const [loading, setLoading] = useState(false);

    const { user, setSelectedChat, setScrollToMessage, chats, setChats } = ChatState();
    const toast = useToast();
    const history = useHistory();

    const fetchDeadlines = async () => {
        setLoading(true);
        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token} `,
                },
            };

            const { data } = await axios.get("/api/deadlines", config);
            setPendingDeadlines(data.pending);
            setCompletedDeadlines(data.completed);
        } catch (error) {
            toast({
                title: "Error fetching deadlines",
                description: error.message,
                status: "error",
                duration: 5000,
                isClosable: true,
                position: "bottom-left",
            });
        }
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen) {
            fetchDeadlines();
        }
        // eslint-disable-next-line
    }, [isOpen]);

    const handleAccessChat = async (chatId, messageId) => {
        // 1. Set Scroll Target
        setScrollToMessage(messageId);

        // 2. Find and Select Chat
        // Check if chat is already in our list (it should be as we fetched active chats)
        let targetChat = chats.find((c) => c._id === chatId);

        if (!targetChat) {
            // Should rarely happen if API consistency is good, but fetch it just in case
            try {
                const config = {
                    headers: { Authorization: `Bearer ${user.token} ` },
                };
                const { data } = await axios.get(`/api/chat/${chatId}`, config); // Assuming this endpoint exists or similar
                // If not, we might need a specific route, but usually we just select it. 
                // For MVP, if it's not in 'chats' context, we might need to fetch it.
                // Let's rely on 'accessChat' logic which usually handles it.
                // Actually, SideDrawer accessChat just creates/fetches one-on-one. 
                // Let's assume it's in the list or we iterate standard flow.
                targetChat = data;
            } catch (e) {
                console.error("Chat not found locally");
            }
        }

        if (targetChat) {
            setSelectedChat(targetChat);
            onClose();
            // Redirect if not on chat page (though logic likely keeps us there)
            history.push("/chats");
        }
    };

    const markAsCompleted = async (deadlineId) => {
        try {
            const config = { headers: { Authorization: `Bearer ${user.token} ` } };
            await axios.patch(`/api/deadlines/${deadlineId}/complete`, {}, config);
            fetchDeadlines(); // Refresh
        } catch (error) {
            toast({ title: "Error updating deadline", status: "error", duration: 3000, isClosable: true });
        }
    };

    const deleteDeadline = async (deadlineId) => {
        try {
            const config = { headers: { Authorization: `Bearer ${user.token}` } };
            await axios.delete(`/api/deadlines/${deadlineId}`, config);
            fetchDeadlines(); // Refresh
        } catch (error) {
            toast({ title: "Error deleting deadline", status: "error", duration: 3000, isClosable: true });
        }
    };

    const DeadlineItem = ({ deadline, isCompleted }) => (
        <Box
            p={3}
            borderWidth="1px"
            borderRadius="lg"
            mb={2}
            bg={isCompleted ? "gray.100" : "white"}
            _hover={{ bg: "gray.50", cursor: "pointer" }}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
        >
            <Box onClick={() => handleAccessChat(deadline.chat._id, deadline.message._id)} flex="1">
                <Text fontWeight="bold">{deadline.title}</Text>
                <Text fontSize="xs" color="gray.500">
                    Due: {new Date(deadline.dueAt).toLocaleString()}
                </Text>
                <Text fontSize="xs" color="blue.500">
                    {deadline.chat.isGroupChat ? deadline.chat.chatName : "Chat"}
                </Text>
            </Box>
            <Box>
                {!isCompleted && (
                    <Button size="xs" colorScheme="green" mr={2} onClick={() => markAsCompleted(deadline._id)}>
                        Done
                    </Button>
                )}
                <Button size="xs" colorScheme="red" onClick={() => deleteDeadline(deadline._id)}>
                    Del
                </Button>
            </Box>
        </Box>
    );

    return (
        <Drawer placement="right" onClose={onClose} isOpen={isOpen} size="md">
            <DrawerOverlay />
            <DrawerContent>
                <DrawerCloseButton />
                <DrawerHeader borderBottomWidth="1px">Deadlines Tracker</DrawerHeader>
                <DrawerBody>
                    {loading ? (
                        <Spinner />
                    ) : (
                        <Tabs isFitted variant="enclosed">
                            <TabList mb="1em">
                                <Tab>Pending ({pendingDeadlines.length})</Tab>
                                <Tab>Completed ({completedDeadlines.length})</Tab>
                            </TabList>
                            <TabPanels>
                                <TabPanel>
                                    {pendingDeadlines.length === 0 ? <Text>No pending deadlines.</Text> : (
                                        pendingDeadlines.map(d => <DeadlineItem key={d._id} deadline={d} isCompleted={false} />)
                                    )}
                                </TabPanel>
                                <TabPanel>
                                    {completedDeadlines.length === 0 ? <Text>No completed deadlines.</Text> : (
                                        completedDeadlines.map(d => <DeadlineItem key={d._id} deadline={d} isCompleted={true} />)
                                    )}
                                </TabPanel>
                            </TabPanels>
                        </Tabs>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    );
};

export default GlobalDeadlineDrawer;
