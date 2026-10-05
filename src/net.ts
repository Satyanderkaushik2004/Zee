import * as Network from 'expo-network';
export async function isOnline() {
  try { const s = await Network.getNetworkStateAsync(); return !!s.isConnected && s.isInternetReachable !== false; }
  catch { return false; }
}
