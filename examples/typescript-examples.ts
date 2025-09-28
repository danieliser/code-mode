// CompanyKit Code Mode - TypeScript Examples
// These examples demonstrate AI-driven TypeScript orchestration

// Example 1: Urgent Support Ticket Analysis
async function analyzeUrgentTickets() {
  console.log("🔍 Analyzing urgent support tickets...");

  // Parallel data fetching
  const [inboxes, recentTickets, siteInfo] = await Promise.all([
    helpscout.searchInboxes("support"),
    helpscout.searchConversations({
      status: "active",
      createdAfter: new Date(Date.now() - 24*60*60*1000).toISOString()
    }),
    wordpress.getSiteInfo()
  ]);

  console.log(`Found ${inboxes.inboxes.length} inboxes and ${recentTickets.conversations.length} recent tickets`);

  // Filter urgent tickets
  const urgentTickets = recentTickets.conversations.filter(ticket =>
    ticket.tags?.some(tag => tag.name?.includes('urgent')) ||
    ticket.subject?.toLowerCase().includes('urgent') ||
    ticket.subject?.toLowerCase().includes('emergency')
  );

  // Analyze response times
  const avgResponseTime = urgentTickets.reduce((sum, ticket) => {
    const created = new Date(ticket.createdAt);
    const firstReply = ticket.threads?.find(t => t.type === 'message' && t.createdBy?.type === 'user');
    if (firstReply) {
      const replied = new Date(firstReply.createdAt);
      return sum + (replied.getTime() - created.getTime());
    }
    return sum;
  }, 0) / urgentTickets.length;

  // Store analysis results
  const analysis = {
    timestamp: new Date().toISOString(),
    urgentTickets: urgentTickets.length,
    totalTickets: recentTickets.conversations.length,
    urgencyRate: urgentTickets.length / recentTickets.conversations.length,
    avgResponseTimeHours: avgResponseTime / (1000 * 60 * 60),
    inboxCount: inboxes.inboxes.length,
    siteUsers: siteInfo.users
  };

  await automem.storeMemory(JSON.stringify(analysis), {
    tags: ["daily-analysis", "helpscout", "urgent"],
    importance: 0.8
  });

  console.log("📊 Analysis complete:", analysis);
  return analysis;
}

// Example 2: Content Performance Analysis
async function analyzeContentPerformance() {
  console.log("📈 Analyzing content performance...");

  // Get recent posts in parallel with site info
  const [recentPosts, siteInfo] = await Promise.all([
    wordpress.queryPosts({
      status: 'publish',
      after: new Date(Date.now() - 30*24*60*60*1000).toISOString(),
      per_page: 50,
      orderby: 'date',
      order: 'desc'
    }),
    wordpress.getSiteInfo()
  ]);

  console.log(`Analyzing ${recentPosts.posts.length} recent posts`);

  // Calculate metrics for each post
  const postMetrics = recentPosts.posts.map(post => {
    const daysSincePublished = (Date.now() - new Date(post.date).getTime()) / (1000 * 60 * 60 * 24);
    const wordCount = post.content.rendered.replace(/<[^>]*>/g, '').split(/\s+/).length;

    return {
      id: post.id,
      title: post.title.rendered,
      publishDate: post.date,
      daysSincePublished: Math.round(daysSincePublished),
      wordCount,
      categories: post.categories?.length || 0,
      tags: post.tags?.length || 0,
      contentScore: wordCount / 100 + (post.categories?.length || 0) * 2 + (post.tags?.length || 0)
    };
  });

  // Calculate aggregate metrics
  const metrics = {
    totalPosts: postMetrics.length,
    avgWordCount: Math.round(postMetrics.reduce((sum, p) => sum + p.wordCount, 0) / postMetrics.length),
    avgContentScore: Math.round(postMetrics.reduce((sum, p) => sum + p.contentScore, 0) / postMetrics.length),
    publishingFrequency: postMetrics.length / 30, // posts per day
    categoriesUsed: new Set(postMetrics.flatMap(p => p.categories)).size,
    topPerformers: postMetrics
      .sort((a, b) => b.contentScore - a.contentScore)
      .slice(0, 5)
      .map(p => ({ title: p.title, score: p.contentScore }))
  };

  // Store results
  await automem.storeMemory(JSON.stringify(metrics), {
    tags: ["content-analysis", "wordpress", "performance"],
    importance: 0.7
  });

  console.log("📊 Content metrics:", metrics);
  return metrics;
}

// Example 3: Data Sync Health Check
async function checkDataSyncHealth() {
  console.log("🏥 Checking data synchronization health...");

  // Check file system for data freshness
  const dataDirectories = await Promise.all([
    serena.listDir("data/edd", false),
    serena.listDir("data/api-service", false),
    serena.listDir("data/reviews", false)
  ]);

  const healthMetrics = {
    timestamp: new Date().toISOString(),
    directories: {
      edd: dataDirectories[0]?.files?.length || 0,
      apiService: dataDirectories[1]?.files?.length || 0,
      reviews: dataDirectories[2]?.files?.length || 0
    },
    totalFiles: (dataDirectories[0]?.files?.length || 0) +
                (dataDirectories[1]?.files?.length || 0) +
                (dataDirectories[2]?.files?.length || 0)
  };

  // Get WordPress site health
  const siteHealth = await wordpress.getSiteInfo();
  healthMetrics.wordpress = {
    users: siteHealth.users,
    plugins: siteHealth.plugins?.length || 0,
    themes: siteHealth.themes?.length || 0
  };

  // Check for stale data (files older than 7 days would be flagged in real implementation)
  const currentHour = new Date().getHours();
  healthMetrics.syncStatus = {
    eddFiles: healthMetrics.directories.edd > 0 ? 'healthy' : 'missing',
    apiFiles: healthMetrics.directories.apiService > 0 ? 'healthy' : 'missing',
    reviewFiles: healthMetrics.directories.reviews > 0 ? 'healthy' : 'missing',
    lastCheckHour: currentHour,
    recommendedAction: healthMetrics.totalFiles === 0 ? 'run-full-sync' : 'monitor'
  };

  // Store health check results
  await automem.storeMemory(JSON.stringify(healthMetrics), {
    tags: ["health-check", "data-sync", "monitoring"],
    importance: 0.6
  });

  console.log("🏥 Health check complete:", healthMetrics);
  return healthMetrics;
}

// Example 4: Advanced Business Intelligence Workflow
async function businessIntelligenceReport() {
  console.log("📊 Generating business intelligence report...");

  // Execute all analysis functions in parallel
  const [urgentAnalysis, contentAnalysis, healthCheck] = await Promise.all([
    analyzeUrgentTickets(),
    analyzeContentPerformance(),
    checkDataSyncHealth()
  ]);

  // Cross-reference data for insights
  const businessInsights = {
    timestamp: new Date().toISOString(),
    executiveSummary: {
      urgentTicketRate: urgentAnalysis.urgencyRate,
      contentProductivity: contentAnalysis.publishingFrequency,
      systemHealth: healthCheck.syncStatus.recommendedAction === 'monitor' ? 'good' : 'needs-attention',
      dataQuality: healthCheck.totalFiles > 50 ? 'excellent' : 'fair'
    },
    recommendations: [],
    correlations: {
      contentVsSupport: {
        postsThisMonth: contentAnalysis.totalPosts,
        urgentTicketsToday: urgentAnalysis.urgentTickets,
        ratio: contentAnalysis.totalPosts / (urgentAnalysis.urgentTickets + 1)
      }
    }
  };

  // Generate recommendations based on data
  if (urgentAnalysis.urgencyRate > 0.1) {
    businessInsights.recommendations.push("High urgent ticket rate detected - consider support team scaling");
  }

  if (contentAnalysis.publishingFrequency < 0.5) {
    businessInsights.recommendations.push("Low content publishing frequency - consider content calendar optimization");
  }

  if (healthCheck.totalFiles === 0) {
    businessInsights.recommendations.push("Data sync issues detected - run full synchronization");
  }

  // Store comprehensive report
  await automem.storeMemory(JSON.stringify(businessInsights), {
    tags: ["business-intelligence", "executive-report", "daily-summary"],
    importance: 0.9
  });

  console.log("📈 Business Intelligence Report Generated");
  console.log("Executive Summary:", businessInsights.executiveSummary);
  console.log("Recommendations:", businessInsights.recommendations);

  return businessInsights;
}

// Example 5: Error Handling and Retry Logic
async function robustDataOperation() {
  console.log("🔄 Executing robust data operation with error handling...");

  const retryOperation = async <T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) throw error;

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("All retry attempts failed");
  };

  try {
    // Example of resilient operations
    const results = await Promise.allSettled([
      retryOperation(() => helpscout.searchInboxes("support")),
      retryOperation(() => wordpress.getSiteInfo()),
      retryOperation(() => automem.storeMemory("Health check", { tags: ["test"] }))
    ]);

    const successfulResults = results.filter(r => r.status === 'fulfilled');
    const failedResults = results.filter(r => r.status === 'rejected');

    console.log(`✅ ${successfulResults.length} operations succeeded`);
    console.log(`❌ ${failedResults.length} operations failed`);

    return {
      success: successfulResults.length > failedResults.length,
      successCount: successfulResults.length,
      failureCount: failedResults.length,
      results: results
    };
  } catch (error) {
    console.error("🚨 Critical error in robust operation:", error);
    throw error;
  }
}

// Export functions for Code Mode execution
export {
  analyzeUrgentTickets,
  analyzeContentPerformance,
  checkDataSyncHealth,
  businessIntelligenceReport,
  robustDataOperation
};