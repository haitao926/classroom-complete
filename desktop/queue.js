function uploadServer(saved, current) {
  if (!saved) return current;
  try {
    new URL(saved);
    return saved;
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
