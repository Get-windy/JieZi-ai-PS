# I:\JieZi\JieZi-ai-PS\performance_test_ideasphere.py
"""
IdeaSphere ("我是人类论坛") Performance Test Script

This script performs comprehensive performance testing on the IdeaSphere forum backend
using Locust, a Python-based distributed load testing tool.

Test Scenarios:
1. User Registration - POST /api/user/register
2. User Login - POST /api/user/login  
3. Create Post - POST /api/post/create
4. Get Post List - GET /api/post/list
5. Get Post Details - GET /api/post/{id}
6. Comment on Post - POST /api/comment/create
7. Vote on Post - POST /api/vote

Performance Metrics:
- Response time (mean, median, 95th percentile)
- Requests per second (RPS)
- Error rate
- Success rate

Usage:
    locust -f performance_test_ideasphere.py --host=http://localhost:3001 --users=100 --spawn-rate=10 --run-time=5m
"""

import json
import random
from locust import HttpUser, task, between, events
from locust.stats import stats_printer, stats_history
from threading import Thread
import time


class IdeaSphereUser(HttpUser):
    """Simulates a user interacting with IdeaSphere forum"""
    
    # Wait time between requests (1-3 seconds)
    wait_time = between(1, 3)
    
    # User credentials for testing
    test_users = [
        {"username": f"testuser{i}", "email": f"test{i}@example.com", "password": "TestPass123!"}
        for i in range(1, 11)
    ]
    
    # Sample post data
    sample_titles = [
        "如何学习Python？",
        "大型分布式系统设计有哪些最佳实践？",
        "AI技术的未来发展方向",
        "推荐一些好的技术博客",
        "如何提高代码质量？",
    ]
    
    sample_contents = [
        "我想学习Python，有什么好的学习资源推荐吗？",
        "在设计大型分布式系统时，有哪些关键点需要注意？",
        "最近在研究AI，感觉未来发展空间很大。",
        "大家有没有收藏一些优质的技术博客？分享一下吧。",
        "代码review有哪些好的实践？",
    ]
    
    def on_start(self):
        """Called when a user starts"""
        self.user_token = None
        self.registered = False
        
    def register_user(self):
        """Register a new user"""
        user = random.choice(self.test_users)
        response = self.client.post(
            "/api/user/register",
            json={
                "username": user["username"],
                "email": user["email"],
                "password": user["password"]
            },
            name="POST /api/user/register"
        )
        if response.status_code == 200:
            self.registered = True
            return True
        return False
    
    def login_user(self):
        """Login and get token"""
        user = random.choice(self.test_users)
        response = self.client.post(
            "/api/user/login",
            json={
                "username": user["username"],
                "password": user["password"]
            },
            name="POST /api/user/login"
        )
        if response.status_code == 200:
            data = response.json()
            self.user_token = data.get("token")
            return True
        return False
    
    @task(2)
    def index(self):
        """Browse the homepage"""
        self.client.get("/", name="GET / (Homepage)")
    
    @task(2)
    def get_user_profile(self):
        """Get user profile"""
        # Try to get profile of first user (example user)
        self.client.get("/api/user/1", name="GET /api/user/{id}")
    
    @task(3)
    def get_post_list(self):
        """Get list of posts"""
        self.client.get(
            "/api/post/list?page=1&limit=10",
            name="GET /api/post/list"
        )
    
    @task(3)
    def get_post_details(self):
        """Get post details"""
        # Try to get first post
        self.client.get(
            "/api/post/1",
            name="GET /api/post/{id}"
        )
    
    @task(2)
    def create_post(self):
        """Create a new post (requires login)"""
        if not self.user_token:
            if not self.login_user():
                return
        
        title = random.choice(self.sample_titles)
        content = random.choice(self.sample_contents)
        
        response = self.client.post(
            "/api/post/create",
            json={
                "title": title,
                "content": content,
                "section_id": 1
            },
            headers={"Authorization": f"Bearer {self.user_token}"},
            name="POST /api/post/create"
        )
    
    @task(2)
    def search_posts(self):
        """Search posts"""
        keywords = ["Python", "AI", "技术", "学习"]
        keyword = random.choice(keywords)
        
        self.client.get(
            f"/api/post/search?q={keyword}",
            name="GET /api/post/search"
        )
    
    @task(1)
    def get_statistics(self):
        """Get forum statistics"""
        self.client.get(
            "/api/statistics",
            name="GET /api/statistics"
        )


class LoadTest(HttpUser):
    """Load testing scenario with higher user count"""
    wait_time = between(0.5, 2)
    host = "http://localhost:3001"
    
    @task(5)
    def heavy_traffic(self):
        """Simulate heavy traffic"""
        self.client.get("/", name="GET / (Homepage)")
        self.client.get("/api/post/list?page=1&limit=20", name="GET /api/post/list (Heavy)")
    
    @task(3)
    def concurrent_requests(self):
        """Simulate concurrent requests"""
        with self.client.get("/api/post/list?page=1&limit=10", name="GET /api/post/list (Concurrent)", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status code: {response.status_code}")


class StressTest(HttpUser):
    """Stress testing scenario - extreme load"""
    wait_time = between(0.1, 0.5)
    host = "http://localhost:3001"
    
    @task(10)
    def extreme_load(self):
        """Simulate extreme load"""
        self.client.get("/", name="GET / (Extreme Load)")
        self.client.get("/api/statistics", name="GET /api/statistics (Extreme)")


# Event hooks for custom metrics
@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, context, exception, **kwargs):
    """Called for every request"""
    if exception:
        print(f"Request to {name} failed: {exception}")
    else:
        print(f"{request_type} {name} - {response_time}ms - Status: {response.status_code}")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts"""
    print(f"\n{'='*60}")
    print("IdeaSphere Performance Test Starting...")
    print(f"Host: {environment.host}")
    print(f"Users: {environment.parsed_options.num_users if environment.parsed_options else 'N/A'}")
    print(f"{'='*60}\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops"""
    print(f"\n{'='*60}")
    print("IdeaSphere Performance Test Completed!")
    print(f"{'='*60}\n")


# Custom stats printer
class CustomStatsPrinter(Thread):
    """Custom stats printer for more detailed output"""
    
    def __init__(self, stats):
        self.stats = stats
        super().__init__()
        self.daemon = True
    
    def run(self):
        while True:
            time.sleep(10)  # Print stats every 10 seconds
            self.print_stats()
    
    def print_stats(self):
        if self.stats.total:
            print(f"\n--- Current Stats ---")
            print(f"Total Requests: {self.stats.total.num_requests}")
            print(f"Total Failures: {self.stats.total.num_failures}")
            print(f"Requests/sec: {self.stats.total.current_rps:.2f}")
            print(f"Failures/sec: {self.stats.total.current_fail_per_sec:.2f}")
            print(f"Response Time (mean): {self.stats.total.avg_response_time:.0f}ms")
            print(f"Response Time (max): {self.stats.total.max_response_time:.0f}ms")
            print(f"Response Time (min): {self.stats.total.min_response_time:.0f}ms")
            print(f"Current Users: {self.stats.total.current_users}")
            print(f"{'-'*30}\n")


# Run with custom stats printer
if __name__ == "__main__":
    import sys
    import os
    
    print("="*60)
    print("IdeaSphere Performance Test Script")
    print("="*60)
    print("\nUsage:")
    print("  locust -f performance_test_ideasphere.py --host=http://localhost:3001")
    print("\nOr for headless testing:")
    print("  locust -f performance_test_ideasphere.py --host=http://localhost:3001")
    print("    --users 100 --spawn-rate 10 --run-time 5m --headless")
    print("\nAccess web UI at: http://localhost:8089")
    print("="*60)
