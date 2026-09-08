function uploadServer(saved, current) {
  try {
    return new URL(saved).toString();
  } catch {
    return current;
  }
}

async function flushPending(items, upload, now = Date.now()) {
  const remaining=[];
  for(const item of items){
    try{
      await upload(item);
    }catch(error){
      remaining.push({...item,lastError:error?.message||String(error),lastAttemptAt:now});
    }
  }
  return remaining;
}

module.exports={uploadServer,flushPending};
