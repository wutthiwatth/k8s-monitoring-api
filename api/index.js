// Import necessary modules
const express = require("express");
const k8s = require("@kubernetes/client-node");
const bodyParser = require("body-parser");

// Create Express app
const app = express();
app.use(bodyParser.json());

// Kubernetes client setup
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

// Middleware for API token authentication
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (token === `Bearer ${process.env.TOKEN ?? 'demo'}`) {
    next();
  } else {
    res.sendStatus(403);
  }
};

app.get("/", (req, res) => {
  res.json({ status: "service is running." });
});


app.get("/readiness", (req, res) => {
  res.json({ status: true });
});

app.get("/liveness", (req, res) => {
  res.json({ status: true });
});

// Route to get pod details
app.get("/api/v1/pods/:namespace", authenticateToken, async (req, res) => {
  const namespace = req.params.namespace;

  try {
    const podsResponse = await k8sApi.listNamespacedPod(namespace);
    const pods = podsResponse.body.items.map((pod) => ({
      name: pod.metadata.name,
      image: pod.spec.containers[0].image,
      annotations: pod.metadata.annotations,
      labels: pod.metadata.labels,
      namespace: pod.metadata.namespace,
      pod,
      creationTimestamp: timeAgo(pod.metadata.creationTimestamp),
    }));
    res.json(pods);
  } catch (error) {
    console.error("Error fetching pods:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to get logs for a specific pod
app.get('/api/v1/pods/:namespace/:podName/logs', authenticateToken, async (req, res) => {
  const namespace = req.params.namespace;
  const podName = req.params.podName;

  try {
      // Fetch logs for the pod
      const logsResponse = await k8sApi.readNamespacedPodLog(podName, namespace);
      const logs = logsResponse.body.split('\n').map(log => {
          const timestamp = new Date().toISOString(); // Replace with actual timestamp if available in the log
          return `${timestamp} ${log}`;
      });
    
      res.send(logs.join('\n'));
  } catch (error) {
      console.error('Error fetching logs for pod:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to get deployment details
app.get(
  "/api/v1/deployments/:namespace",
  authenticateToken,
  async (req, res) => {
    const namespace = req.params.namespace;

    try {
      const deploymentsResponse = await k8sAppsApi.listNamespacedDeployment(
        namespace
      );
      const deployments = deploymentsResponse.body.items.map((deployment) => ({
        name: deployment.metadata.name,
        replicas: deployment.spec.replicas,
        availableReplicas: deployment.status.availableReplicas,
        annotations: deployment.metadata.annotations,
        labels: deployment.metadata.labels,
        namespace: deployment.metadata.namespace,
        creationTimestamp: timeAgo(deployment.metadata.creationTimestamp),
      }));
      res.json(deployments);
    } catch (error) {
      console.error("Error fetching deployments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Route to get jobs
app.get("/api/v1/jobs/:namespace", authenticateToken, async (req, res) => {
  const namespace = req.params.namespace;

  try {
    const jobsResponse = await k8sBatchApi.listNamespacedJob(namespace);
    const jobs = jobsResponse.body.items.map((job) => ({
      name: job.metadata.name,
      completions: job.spec.completions,
      parallelism: job.spec.parallelism,
      creationTimestamp: timeAgo(job.metadata.creationTimestamp),
      meta: job.metadata,
    }));
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Route to get events related to pods
app.get('/api/v1/events/:namespace/:pod', authenticateToken, async (req, res) => {
  const namespace = req.params.namespace;
  const podName = req.params.pod;

  try {
      const eventsResponse = await k8sApi.listNamespacedEvent(namespace, undefined, undefined, undefined, `involvedObject.name=${podName}`);
      const events = eventsResponse.body.items.map(event => ({
          message: event.message,
          reason: event.reason,
          type: event.type,
          event: {...event},
          timestamp: timeAgo(event.lastTimestamp ?? event.eventTime),
      }));
      res.json(events);
  } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});


// Route to get statefulsets
app.get(
  "/api/v1/statefulsets/:namespace",
  authenticateToken,
  async (req, res) => {
    const namespace = req.params.namespace;

    try {
      const statefulSetsResponse = await k8sAppsApi.listNamespacedStatefulSet(
        namespace
      );
      const statefulSets = statefulSetsResponse.body.items.map(
        (statefulSet) => ({
          name: statefulSet.metadata.name,
          replicas: statefulSet.spec.replicas,
          currentReplicas: statefulSet.status.currentReplicas,
          annotations: statefulSet.metadata.annotations,
          labels: statefulSet.metadata.labels,
          namespace: statefulSet.metadata.namespace,
          creationTimestamp: timeAgo(statefulSet.metadata.creationTimestamp),
        })
      );
      res.json(statefulSets);
    } catch (error) {
      console.error("Error fetching statefulsets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get("/api/v1/namespaces", authenticateToken, async (req, res) => {
  try {
    const namespacesResponse = await k8sApi.listNamespace();
    const namespaces = namespacesResponse.body.items.map((ns) => ({
      name: ns.metadata.name,
      labels: ns.metadata.labels,
      annotations: ns.metadata.annotations,
      status: ns.status.phase,
      creationTimestamp: timeAgo(ns.metadata.creationTimestamp),
    }));
    res.json(namespaces);
  } catch (error) {
    console.error("Error fetching namespaces:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function timeAgo(timestamp) {
  const now = new Date();
  const created = new Date(timestamp);
  const diff = now - created;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return `${seconds} seconds ago`;
  } else if (minutes < 60) {
    return `${minutes} minutes ago`;
  } else if (hours < 24) {
    return `${hours} hours ago`;
  } else if (days < 30) {
    return `${days} days ago`;
  } else if (months < 12) {
    return `${months} months ago`;
  } else {
    return `${years} years ago`;
  }
}
