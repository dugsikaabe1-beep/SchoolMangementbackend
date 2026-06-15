const queueState = {
  driver: 'memory',
  jobs: [],
};

export const enqueueJob = async (name, payload = {}, options = {}) => {
  const job = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    payload,
    options,
    status: 'queued',
    createdAt: new Date(),
  };
  queueState.jobs.unshift(job);
  queueState.jobs = queueState.jobs.slice(0, 500);
  return job;
};

export const getQueueStatus = () => ({
  driver: queueState.driver,
  waiting: queueState.jobs.filter((job) => job.status === 'queued').length,
  completed: queueState.jobs.filter((job) => job.status === 'completed').length,
  failed: queueState.jobs.filter((job) => job.status === 'failed').length,
  recentJobs: queueState.jobs.slice(0, 25),
});
