/**
 * Example MCP Server with UI Resource
 * 
 * This demonstrates how to create an MCP server that provides
 * interactive HTML UIs inline in chat using the MCP Apps specification.
 * 
 * To use with Obsidian Vault Copilot:
 * 1. Run this server: node server.js
 * 2. Configure the MCP server in Vault Copilot settings
 * 3. Call the "get_weather" tool to see the UI rendered inline
 */

const fs = require('fs');
const path = require('path');

// Simple stdio-based MCP server
process.stdin.setEncoding('utf8');

let buffer = '';

process.stdin.on('data', (chunk) => {
	buffer += chunk;
	
	// Try to parse complete JSON-RPC messages
	const lines = buffer.split('\n');
	buffer = lines.pop() || ''; // Keep incomplete line in buffer
	
	for (const line of lines) {
		if (!line.trim()) continue;
		
		try {
			const message = JSON.parse(line);
			handleMessage(message);
		} catch (e) {
			console.error('Failed to parse message:', e);
		}
	}
});

function sendResponse(id, result) {
	const response = JSON.stringify({
		jsonrpc: '2.0',
		id,
		result
	});
	process.stdout.write(response + '\n');
}

function sendError(id, code, message) {
	const response = JSON.stringify({
		jsonrpc: '2.0',
		id,
		error: { code, message }
	});
	process.stdout.write(response + '\n');
}

// Read the HTML file
const weatherUiHtml = fs.readFileSync(path.join(__dirname, 'weather-ui.html'), 'utf8');

// Mock weather data
function getWeatherData(location) {
	const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
	const condition = conditions[Math.floor(Math.random() * conditions.length)];
	const temp = Math.round(15 + Math.random() * 20);
	const humidity = Math.round(40 + Math.random() * 40);
	
	return {
		location,
		condition,
		temperature: temp,
		temperatureUnit: 'C',
		humidity,
		windSpeed: Math.round(5 + Math.random() * 25),
		windUnit: 'km/h',
		timestamp: new Date().toISOString()
	};
}

function handleMessage(message) {
	const { id, method, params } = message;
	
	switch (method) {
		case 'initialize':
			sendResponse(id, {
				protocolVersion: '2025-01-01',
				serverInfo: {
					name: 'weather-app',
					version: '1.0.0'
				},
				capabilities: {
					resources: { listChanged: false },
					tools: { listChanged: false }
				},
				extensions: {
					'io.modelcontextprotocol/ui': {
						mimeTypes: ['text/html;profile=mcp-app']
					}
				}
			});
			break;
			
		case 'resources/list':
			sendResponse(id, {
				resources: [
					{
						uri: 'ui://weather-app/dashboard',
						name: 'Weather Dashboard',
						description: 'Interactive weather display with forecast',
						mimeType: 'text/html;profile=mcp-app'
					}
				]
			});
			break;
			
		case 'resources/read':
			if (params?.uri === 'ui://weather-app/dashboard') {
				sendResponse(id, {
					contents: [
						{
							uri: 'ui://weather-app/dashboard',
							mimeType: 'text/html;profile=mcp-app',
							text: weatherUiHtml,
							_meta: {
								ui: {
									prefersBorder: true,
									csp: {
										connectDomains: ['https://api.weather.gov']
									}
								}
							}
						}
					]
				});
			} else {
				sendError(id, -32602, `Unknown resource: ${params?.uri}`);
			}
			break;
			
		case 'tools/list':
			sendResponse(id, {
				tools: [
					{
						name: 'get_weather',
						description: 'Get current weather for a location. Returns weather data and optionally renders an interactive dashboard.',
						inputSchema: {
							type: 'object',
							properties: {
								location: {
									type: 'string',
									description: 'City name or location (e.g., "New York", "London")'
								}
							},
							required: ['location']
						},
						_meta: {
							ui: {
								resourceUri: 'ui://weather-app/dashboard',
								visibility: ['model', 'app']
							}
						}
					},
					{
						name: 'get_forecast',
						description: 'Get weather forecast for upcoming days',
						inputSchema: {
							type: 'object',
							properties: {
								location: {
									type: 'string',
									description: 'City name or location'
								},
								days: {
									type: 'number',
									description: 'Number of forecast days (1-7)',
									default: 3
								}
							},
							required: ['location']
						},
						_meta: {
							ui: {
								visibility: ['model', 'app']
							}
						}
					}
				]
			});
			break;
			
		case 'tools/call':
			const toolName = params?.name;
			const toolArgs = params?.arguments || {};
			
			if (toolName === 'get_weather') {
				const weather = getWeatherData(toolArgs.location || 'Unknown');
				sendResponse(id, {
					content: [
						{
							type: 'text',
							text: `Current weather in ${weather.location}: ${weather.condition}, ${weather.temperature}°${weather.temperatureUnit}`
						}
					],
					structuredContent: weather,
					_meta: {
						ui: {
							resourceUri: 'ui://weather-app/dashboard'
						}
					}
				});
			} else if (toolName === 'get_forecast') {
				const days = Math.min(7, Math.max(1, toolArgs.days || 3));
				const forecast = [];
				for (let i = 0; i < days; i++) {
					const date = new Date();
					date.setDate(date.getDate() + i);
					forecast.push({
						date: date.toISOString().split('T')[0],
						...getWeatherData(toolArgs.location || 'Unknown')
					});
				}
				sendResponse(id, {
					content: [
						{
							type: 'text',
							text: `${days}-day forecast for ${toolArgs.location}`
						}
					],
					structuredContent: { forecast }
				});
			} else {
				sendError(id, -32602, `Unknown tool: ${toolName}`);
			}
			break;
			
		default:
			sendError(id, -32601, `Method not found: ${method}`);
	}
}

// Log startup
console.error('[Weather MCP Server] Started and listening on stdin');
