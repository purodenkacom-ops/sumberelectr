const TARGET_URL = process.env.URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.env.USERS || '50', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL || '200', 10);

async function runLoadTest() {
  console.log(`Starting load test...`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Concurrent Users: ${CONCURRENCY}`);
  console.log(`Total Requests: ${TOTAL_REQUESTS}\n`);

  let successCount = 0;
  let failCount = 0;
  const latencies = [];

  const startTime = Date.now();

  let completed = 0;
  
  async function worker() {
    while (completed < TOTAL_REQUESTS) {
      completed++;
      const reqStart = Date.now();
      try {
        const res = await fetch(TARGET_URL);
        const duration = Date.now() - reqStart;
        latencies.push(duration);
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTime = (Date.now() - startTime) / 1000;
  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : 0;
  const rps = (successCount / totalTime).toFixed(2);

  console.log(`--- Results ---`);
  console.log(`Total Time: ${totalTime.toFixed(2)}s`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Avg Latency: ${avgLatency} ms`);
  console.log(`Requests/sec: ${rps}`);
}

runLoadTest();
