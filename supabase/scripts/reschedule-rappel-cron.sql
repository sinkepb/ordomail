select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'send-rappel-sms'), schedule := '0 * * * *');
select jobid, jobname, schedule, active from cron.job where jobname = 'send-rappel-sms';
