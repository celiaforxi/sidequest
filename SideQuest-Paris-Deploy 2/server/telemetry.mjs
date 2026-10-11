// Allowlist only: never log prompts, itinerary, provider bodies or credentials.
export function logRequest(record){
 const safe={timestamp:new Date().toISOString(),source:['ai','mock'].includes(record.source)?record.source:'unknown',status:record.status,responseMs:record.responseMs,errorType:record.errorType};
 console.log(JSON.stringify(safe));
}
