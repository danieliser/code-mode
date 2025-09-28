
console.log('Testing MCP tool calls...');
const result1 = await automem.checkDatabaseHealth();
const result2 = await helpscout.searchInboxes('test');
console.log('AutoMem result:', JSON.stringify(result1, null, 2));
console.log('HelpScout result:', JSON.stringify(result2, null, 2));
