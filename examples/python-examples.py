#!/usr/bin/env python3
"""
Code Mode - Python Examples
Data analysis workflows using the Python runtime
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any
import statistics

def analyze_support_metrics() -> Dict[str, Any]:
    """Analyze support ticket metrics using Python data analysis"""
    print("📊 Analyzing support metrics with Python...")

    # Get recent tickets (last 7 days)
    week_ago = (datetime.now() - timedelta(days=7)).isoformat()
    tickets = helpscout_search_conversations({
        'status': 'active',
        'createdAfter': week_ago
    })

    # Get inbox information
    inboxes = helpscout_search_inboxes("support", limit=10)

    if not tickets.get('conversations'):
        print("⚠️ No ticket data available")
        return {"error": "No ticket data"}

    conversations = tickets['conversations']

    # Calculate metrics
    total_tickets = len(conversations)
    urgent_tickets = [t for t in conversations
                     if 'urgent' in t.get('subject', '').lower() or
                        any('urgent' in tag.get('name', '').lower()
                           for tag in t.get('tags', []))]

    # Response time analysis
    response_times = []
    for ticket in conversations:
        threads = ticket.get('threads', [])
        if threads:
            first_thread = threads[0]
            created = datetime.fromisoformat(ticket['createdAt'].replace('Z', '+00:00'))
            if threads[1:]:  # Has replies
                first_reply = threads[1]
                replied = datetime.fromisoformat(first_reply['createdAt'].replace('Z', '+00:00'))
                response_time_hours = (replied - created).total_seconds() / 3600
                response_times.append(response_time_hours)

    # Calculate statistics
    metrics = {
        'timestamp': datetime.now().isoformat(),
        'period_days': 7,
        'total_tickets': total_tickets,
        'urgent_tickets': len(urgent_tickets),
        'urgency_rate': len(urgent_tickets) / total_tickets if total_tickets > 0 else 0,
        'inbox_count': len(inboxes.get('inboxes', [])),
        'response_times': {
            'count': len(response_times),
            'avg_hours': statistics.mean(response_times) if response_times else 0,
            'median_hours': statistics.median(response_times) if response_times else 0,
            'min_hours': min(response_times) if response_times else 0,
            'max_hours': max(response_times) if response_times else 0
        },
        'daily_breakdown': analyze_daily_ticket_distribution(conversations)
    }

    # Store results in memory
    automem_store_memory(
        json.dumps(metrics, indent=2),
        tags=['python-analysis', 'support-metrics', 'weekly-report'],
        importance=0.8
    )

    print(f"📈 Analysis complete: {total_tickets} tickets, {len(urgent_tickets)} urgent")
    return metrics

def analyze_daily_ticket_distribution(conversations: List[Dict]) -> Dict[str, int]:
    """Analyze ticket distribution by day of week"""
    daily_counts = {
        'monday': 0, 'tuesday': 0, 'wednesday': 0, 'thursday': 0,
        'friday': 0, 'saturday': 0, 'sunday': 0
    }

    for ticket in conversations:
        created = datetime.fromisoformat(ticket['createdAt'].replace('Z', '+00:00'))
        day_name = created.strftime('%A').lower()
        if day_name in daily_counts:
            daily_counts[day_name] += 1

    return daily_counts

def wordpress_content_analysis() -> Dict[str, Any]:
    """Analyze WordPress content performance and trends"""
    print("📝 Analyzing WordPress content with Python...")

    # Get site information
    site_info = wordpress_get_site_info()

    # Get recent posts (last 30 days)
    month_ago = (datetime.now() - timedelta(days=30)).isoformat()
    posts = wordpress_query_posts({
        'status': 'publish',
        'after': month_ago,
        'per_page': 100,
        'orderby': 'date',
        'order': 'desc'
    })

    if not posts.get('posts'):
        print("⚠️ No post data available")
        return {"error": "No post data"}

    # Analyze content metrics
    post_data = []
    for post in posts['posts']:
        # Calculate content metrics
        content_text = post['content']['rendered']
        word_count = len(content_text.split())

        # Parse publish date
        pub_date = datetime.fromisoformat(post['date'].replace('Z', '+00:00'))
        days_since_pub = (datetime.now(pub_date.tzinfo) - pub_date).days

        post_data.append({
            'id': post['id'],
            'title': post['title']['rendered'][:100] + '...' if len(post['title']['rendered']) > 100 else post['title']['rendered'],
            'word_count': word_count,
            'days_since_published': days_since_pub,
            'categories': len(post.get('categories', [])),
            'tags': len(post.get('tags', [])),
            'publish_date': post['date'],
            'content_score': word_count / 100 + len(post.get('categories', [])) * 2
        })

    # Calculate aggregate metrics
    word_counts = [p['word_count'] for p in post_data]
    content_scores = [p['content_score'] for p in post_data]

    analysis = {
        'timestamp': datetime.now().isoformat(),
        'site_info': {
            'name': site_info.get('name', 'Unknown'),
            'url': site_info.get('url', ''),
            'users': site_info.get('users', 0)
        },
        'content_metrics': {
            'total_posts': len(post_data),
            'avg_word_count': statistics.mean(word_counts) if word_counts else 0,
            'median_word_count': statistics.median(word_counts) if word_counts else 0,
            'avg_content_score': statistics.mean(content_scores) if content_scores else 0,
            'publishing_frequency': len(post_data) / 30,  # posts per day
            'word_count_distribution': {
                'short': len([w for w in word_counts if w < 300]),
                'medium': len([w for w in word_counts if 300 <= w < 1000]),
                'long': len([w for w in word_counts if w >= 1000])
            }
        },
        'top_performers': sorted(post_data, key=lambda x: x['content_score'], reverse=True)[:5],
        'recent_posts': sorted(post_data, key=lambda x: x['days_since_published'])[:5]
    }

    # Store analysis
    automem_store_memory(
        json.dumps(analysis, indent=2),
        tags=['python-analysis', 'wordpress', 'content-performance'],
        importance=0.7
    )

    print(f"📊 Content analysis complete: {len(post_data)} posts analyzed")
    return analysis

def data_quality_assessment() -> Dict[str, Any]:
    """Assess data quality across different sources"""
    print("🔍 Assessing data quality with Python...")

    # Check file system data
    try:
        edd_files = serena_list_dir("data/edd", recursive=False)
        api_files = serena_list_dir("data/api-service", recursive=False)
        review_files = serena_list_dir("data/reviews", recursive=False)
    except Exception as e:
        print(f"❌ Error accessing file system: {e}")
        edd_files = api_files = review_files = {"files": []}

    # Assess WordPress data quality
    wp_health = wordpress_get_site_info()

    # Calculate quality scores
    file_counts = {
        'edd': len(edd_files.get('files', [])),
        'api_service': len(api_files.get('files', [])),
        'reviews': len(review_files.get('files', []))
    }

    total_files = sum(file_counts.values())

    # Quality scoring
    quality_score = 0
    quality_factors = []

    # File availability scoring
    if total_files > 50:
        quality_score += 40
        quality_factors.append("Excellent file coverage")
    elif total_files > 20:
        quality_score += 25
        quality_factors.append("Good file coverage")
    else:
        quality_score += 10
        quality_factors.append("Limited file coverage")

    # WordPress connectivity scoring
    if wp_health.get('users', 0) > 0:
        quality_score += 30
        quality_factors.append("WordPress API accessible")
    else:
        quality_factors.append("WordPress API issues")

    # Data freshness (mock scoring - in real implementation would check file timestamps)
    current_hour = datetime.now().hour
    if 6 <= current_hour <= 22:  # Business hours
        quality_score += 20
        quality_factors.append("Data accessed during business hours")
    else:
        quality_score += 10
        quality_factors.append("Data accessed outside business hours")

    assessment = {
        'timestamp': datetime.now().isoformat(),
        'overall_score': min(quality_score, 100),  # Cap at 100
        'file_counts': file_counts,
        'total_files': total_files,
        'wordpress_status': {
            'accessible': wp_health.get('users', 0) > 0,
            'users': wp_health.get('users', 0),
            'plugins': len(wp_health.get('plugins', [])),
            'themes': len(wp_health.get('themes', []))
        },
        'quality_factors': quality_factors,
        'recommendations': generate_quality_recommendations(file_counts, wp_health)
    }

    # Store assessment
    automem_store_memory(
        json.dumps(assessment, indent=2),
        tags=['python-analysis', 'data-quality', 'assessment'],
        importance=0.6
    )

    print(f"📋 Quality assessment complete: {quality_score}/100 score")
    return assessment

def generate_quality_recommendations(file_counts: Dict, wp_health: Dict) -> List[str]:
    """Generate recommendations based on data quality assessment"""
    recommendations = []

    if sum(file_counts.values()) < 20:
        recommendations.append("Run full data synchronization to improve file coverage")

    if file_counts['edd'] == 0:
        recommendations.append("Sync EDD database tables - no files found")

    if file_counts['api_service'] == 0:
        recommendations.append("Sync API service data - missing key metrics")

    if wp_health.get('users', 0) == 0:
        recommendations.append("Check WordPress API connectivity and credentials")

    if not recommendations:
        recommendations.append("Data quality is good - continue monitoring")

    return recommendations

def comprehensive_business_report() -> Dict[str, Any]:
    """Generate comprehensive business intelligence report"""
    print("📈 Generating comprehensive business report with Python...")

    # Run all analyses
    try:
        support_analysis = analyze_support_metrics()
        content_analysis = wordpress_content_analysis()
        quality_assessment_result = data_quality_assessment()

        # Combine insights
        report = {
            'timestamp': datetime.now().isoformat(),
            'report_type': 'comprehensive_business_intelligence',
            'executive_summary': {
                'data_quality_score': quality_assessment_result.get('overall_score', 0),
                'support_urgency_rate': support_analysis.get('urgency_rate', 0),
                'content_productivity': content_analysis.get('content_metrics', {}).get('publishing_frequency', 0),
                'total_data_files': quality_assessment_result.get('total_files', 0)
            },
            'detailed_analysis': {
                'support_metrics': support_analysis,
                'content_performance': content_analysis,
                'data_quality': quality_assessment_result
            },
            'key_insights': [],
            'action_items': []
        }

        # Generate insights
        insights = []
        actions = []

        # Support insights
        if support_analysis.get('urgency_rate', 0) > 0.15:
            insights.append("High urgent ticket rate indicates potential service issues")
            actions.append("Review urgent ticket resolution process")

        # Content insights
        pub_freq = content_analysis.get('content_metrics', {}).get('publishing_frequency', 0)
        if pub_freq < 0.3:
            insights.append("Low content publishing frequency may impact SEO")
            actions.append("Increase content production schedule")

        # Data quality insights
        if quality_assessment_result.get('overall_score', 0) < 70:
            insights.append("Data quality issues detected requiring attention")
            actions.append("Run comprehensive data synchronization")

        report['key_insights'] = insights or ["All metrics within normal parameters"]
        report['action_items'] = actions or ["Continue current monitoring schedule"]

        # Store comprehensive report
        automem_store_memory(
            json.dumps(report, indent=2),
            tags=['python-analysis', 'business-intelligence', 'comprehensive-report'],
            importance=0.9
        )

        print("🎯 Comprehensive business report generated successfully")
        return report

    except Exception as e:
        print(f"❌ Error generating comprehensive report: {e}")
        return {"error": str(e), "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    # Example execution
    print("🐍 Python Code Mode Examples")
    print("=" * 40)

    # Run a sample analysis
    try:
        result = analyze_support_metrics()
        print(f"✅ Sample analysis completed: {result.get('total_tickets', 0)} tickets analyzed")
    except Exception as e:
        print(f"❌ Sample analysis failed: {e}")