import { useEffect, useState } from 'react';
import { Bot, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<string>('Loading...');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hasGuildId, setHasGuildId] = useState<boolean>(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/bot-status');
        const data = await res.json();
        setStatus(data.status);
        setIsConnected(data.connected);
        setHasGuildId(data.hasGuildId);
      } catch (error) {
        setStatus('Failed to connect to server');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const isFullyConfigured = isConnected && hasGuildId;

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-neutral-100 overflow-hidden">
        <div className="p-6 text-center border-b border-neutral-100 bg-neutral-900 text-white">
          <Bot className="w-16 h-16 mx-auto mb-4 text-blue-400" />
          <h1 className="text-2xl font-bold mb-2">Discord Bot Panel</h1>
          <p className="text-neutral-400 text-sm">Powered by AI Studio</p>
        </div>
        
        <div className="p-6">
          <div className="flex flex-col space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-100">
              <span className="font-medium text-neutral-700">Bot Status:</span>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                )}
                <span className={`font-semibold ${isConnected ? 'text-emerald-600' : 'text-amber-600'} text-right max-w-[150px] truncate`} title={status}>
                  {status}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-100">
              <span className="font-medium text-neutral-700">Guild ID:</span>
              <div className="flex items-center space-x-2">
                {hasGuildId ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                )}
                <span className={`font-semibold ${hasGuildId ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {hasGuildId ? 'Configured' : 'Missing'}
                </span>
              </div>
            </div>
            
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
              <span className="font-medium text-neutral-700 block mb-2">GitHub Webhook URL:</span>
              <code className="text-xs break-all bg-neutral-200 p-2 rounded block">
                https://ais-pre-lxk5ujzptw2iab52ugxqyw-669993466217.asia-east1.run.app/api/github-webhook
              </code>
            </div>
          </div>

          {!isFullyConfigured && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-sm border border-blue-100">
                <p className="font-semibold mb-2">Setup Required:</p>
                <ol className="list-decimal list-inside space-y-2">
                  {!isConnected && (
                    <>
                      <li>Go to the Discord Developer Portal</li>
                      <li>Create a new application & bot</li>
                      <li>Copy the Bot Token and add it to the Secrets panel as <strong>DISCORD_BOT_TOKEN</strong></li>
                    </>
                  )}
                  {!hasGuildId && (
                    <li>Copy your Discord Server ID and add it to the Secrets panel as <strong>DISCORD_GUILD_ID</strong></li>
                  )}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
