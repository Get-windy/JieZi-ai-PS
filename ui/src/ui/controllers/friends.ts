/**
 * Friends Controller
 * 好友关系管理控制器
 */

import type { OpenClawApp } from "../app.ts";

export interface Friend {
  id: string;
  agentId: string;
  agentName: string;
  status: "online" | "offline" | "busy";
  lastActive?: number;
  remark?: string;
}

export interface FriendRequest {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  status: "pending" | "accepted" | "rejected";
  message?: string;
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  timestamp: number;
  read: boolean;
}

export interface FriendsState {
  friendsLoading: boolean;
  friendsError: string | null;
  friendsList: Friend[];
  friendsTotal: number;
  friendRequestsLoading: boolean;
  friendRequestsList: FriendRequest[];
  selectedFriendId: string | null;
  messagesLoading: boolean;
  messagesList: DirectMessage[];
  sendingMessage: boolean;
}

/**
 * 加载好友列表
 */
export async function loadFriends(host: OpenClawApp, agentId: string): Promise<void> {
  host.friendsLoading = true;
  host.friendsError = null;

  try {
    const response = await host.client.request("friends.list", { agentId });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to load friends");
    }

    const friends = response.result?.friends || [];
    host.friendsList = friends;
    host.friendsTotal = response.result?.total || friends.length;
  } catch (err) {
    console.error("Failed to load friends:", err);
    host.friendsError = err instanceof Error ? err.message : String(err);
    host.friendsList = [];
    host.friendsTotal = 0;
  } finally {
    host.friendsLoading = false;
  }
}

/**
 * 加载好友请求列表
 */
export async function loadFriendRequests(host: OpenClawApp, agentId: string): Promise<void> {
  host.friendRequestsLoading = true;

  try {
    const response = await host.client.request("friends.requests", { agentId });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to load friend requests");
    }

    host.friendRequestsList = response.result?.requests || [];
  } catch (err) {
    console.error("Failed to load friend requests:", err);
    host.friendRequestsList = [];
  } finally {
    host.friendRequestsLoading = false;
  }
}

/**
 * 添加好友
 */
export async function addFriend(
  host: OpenClawApp,
  fromAgentId: string,
  toAgentId: string,
  message?: string,
): Promise<boolean> {
  try {
    const response = await host.client.request("friends.add", {
      fromAgentId,
      toAgentId,
      message,
    });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to add friend");
    }

    // 重新加载好友列表
    await loadFriends(host, fromAgentId);
    return true;
  } catch (err) {
    console.error("Failed to add friend:", err);
    host.friendsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * 确认好友请求
 */
export async function confirmFriend(
  host: OpenClawApp,
  agentId: string,
  friendId: string,
  accept: boolean,
): Promise<boolean> {
  try {
    const response = await host.client.request("friends.confirm", {
      agentId,
      friendId,
      accept,
    });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to confirm friend");
    }

    // 重新加载好友请求和好友列表
    await loadFriendRequests(host, agentId);
    if (accept) {
      await loadFriends(host, agentId);
    }
    return true;
  } catch (err) {
    console.error("Failed to confirm friend:", err);
    host.friendsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * 删除好友
 */
export async function removeFriend(
  host: OpenClawApp,
  agentId: string,
  friendId: string,
): Promise<boolean> {
  if (!confirm("确定要删除此好友吗？")) {
    return false;
  }

  try {
    const response = await host.client.request("friends.remove", {
      agentId,
      friendId,
    });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to remove friend");
    }

    // 重新加载好友列表
    await loadFriends(host, agentId);
    return true;
  } catch (err) {
    console.error("Failed to remove friend:", err);
    host.friendsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * 加载消息历史
 */
export async function loadMessages(
  host: OpenClawApp,
  agentId: string,
  friendId: string,
  limit = 50,
  offset = 0,
): Promise<void> {
  host.messagesLoading = true;

  try {
    const response = await host.client.request("friends.messages", {
      agentId,
      friendId,
      limit,
      offset,
    });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to load messages");
    }

    host.messagesList = response.result?.messages || [];
  } catch (err) {
    console.error("Failed to load messages:", err);
    host.messagesList = [];
  } finally {
    host.messagesLoading = false;
  }
}

/**
 * 发送消息
 */
export async function sendMessage(
  host: OpenClawApp,
  fromAgentId: string,
  toAgentId: string,
  content: string,
): Promise<boolean> {
  host.sendingMessage = true;

  try {
    const response = await host.client.request("friends.sendMessage", {
      fromAgentId,
      toAgentId,
      content,
    });

    if (!response) {
      throw new Error("No response from server");
    }

    if (response.error) {
      throw new Error(response.error.message || "Failed to send message");
    }

    // 重新加载消息列表
    await loadMessages(host, fromAgentId, toAgentId);
    return true;
  } catch (err) {
    console.error("Failed to send message:", err);
    return false;
  } finally {
    host.sendingMessage = false;
  }
}
