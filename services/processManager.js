const pidusage = require('pidusage');
const Server = require('../models/Server');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const consoleManager = require('./consoleManager');

class ProcessManager extends EventEmitter {

constructor() {
    super();

    this.processes = new Map();
    this.io = null;

    setInterval(() => {
        this.checkResources();
    }, 5000);
}


setSocketIO(io) {
    this.io = io;
    consoleManager.setSocketIO(io);
}



async killProcess(pid, signal='SIGTERM') {

    return new Promise(resolve=>{

        try {

            process.kill(pid, signal);

            setTimeout(()=>{

                try {
                    process.kill(pid,0);
                    process.kill(pid,'SIGKILL');
                }catch{}

                resolve();

            },1000);


        }catch{
            resolve();
        }

    });

}



async stopProcessTree(pid){

    try{
        await this.killProcess(pid,'SIGTERM');
    }catch{
        await this.killProcess(pid,'SIGKILL');
    }

}



async installDependencies(serverPath,serverId){

const packagePath = path.join(serverPath,'package.json');


if(!await fs.pathExists(packagePath)){

await fs.writeFile(
packagePath,
JSON.stringify({
name:path.basename(serverPath),
version:"1.0.0",
main:"index.js",
scripts:{
start:"node index.js"
},
dependencies:{}

},null,2)
);

}


consoleManager.info(
serverId,
"📦 جاري تثبيت الحزم...\n"
);


return new Promise((resolve,reject)=>{


const npm = spawn(
"npm",
["install"],
{
cwd:serverPath,
shell:false
}
);



npm.stdout.on(
'data',
data=>{
consoleManager.sendAndSave(
serverId,
serverPath,
'stdout',
data.toString()
);
});


npm.stderr.on(
'data',
data=>{
consoleManager.sendAndSave(
serverId,
serverPath,
'stderr',
data.toString()
);
});



npm.on(
'close',
code=>{

if(code===0){

consoleManager.success(
serverId,
"✅ تم تثبيت الحزم\n"
);

resolve();

}else{

reject(
new Error(
`npm install failed ${code}`
)
);

}

});


});

}



async clearLogs(serverPath,serverId){

const file =
path.join(
serverPath,
"logs",
"bot.log"
);


if(await fs.pathExists(file)){

await fs.writeFile(file,'');

}


consoleManager.clearBuffer(serverId);

}

    async start(server){

const serverId = server._id.toString();


if(this.processes.has(serverId)){

consoleManager.warn(
serverId,
"⚠️ السيرفر شغال بالفعل\n"
);

return {
success:false,
error:"السيرفر شغال بالفعل"
};

}



try{


const serverPath = server.path;
const mainFile = server.mainFile || "index.js";


const mainFilePath =
path.join(serverPath,mainFile);



if(!await fs.pathExists(mainFilePath)){

throw new Error(
`الملف ${mainFile} غير موجود`
);

}



await this.clearLogs(
serverPath,
serverId
);



await this.installDependencies(
serverPath,
serverId
);



const env = {

    ...process.env,

    PORT: String(server.port),

    HOST: "0.0.0.0",

    SERVER_ID: serverId,

    ...(server.envVariables || {})

};



consoleManager.info(
serverId,
`🚀 تشغيل ${mainFile}\n`
);



let command;
let args;

if (server.language === 'python') {
    command = 'python3';
    args = [mainFile];
} else {
    command = 'node';
    args = [mainFile];
}

const child = spawn(
    command,
    args,
    {
        cwd: serverPath,
        env,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe']
    }
);



child.stdout.on(
'data',
data=>{

consoleManager.sendAndSave(
serverId,
serverPath,
"stdout",
data.toString()
);

}
);



child.stderr.on(
'data',
data=>{

consoleManager.sendAndSave(
serverId,
serverPath,
"stderr",
data.toString()
);

}
);



child.on(
'exit',
code=>{

this.processes.delete(serverId);


consoleManager.info(
serverId,
`📴 توقف السيرفر ${code}\n`
);


Server.findByIdAndUpdate(
serverId,
{
status:"stopped",
pid:null
}

).exec();



if(this.io){

this.io
.to("server:"+serverId)
.emit(
"status-update",
{
id:serverId,
status:"stopped"
}
);

}


}

);




child.on(
'error',
err=>{

this.processes.delete(serverId);


consoleManager.error(
serverId,
err.message
);

}

);



if(!child.pid){

throw new Error(
"فشل تشغيل العملية"
);

}



this.processes.set(
serverId,
{
process:child,
pid:child.pid
}
);



server.pid = child.pid;

server.status="running";


await server.save();



await fs.writeFile(
path.join(serverPath,"server.pid"),
String(child.pid)
);



consoleManager.success(
serverId,
`✅ يعمل PID:${child.pid}\n`
);



return {

success:true,

pid:child.pid

};



}catch(err){


consoleManager.error(
serverId,
`❌ ${err.message}\n`
);


throw err;


}

}






async stop(serverId,serverPath){


serverId = serverId.toString();



const data =
this.processes.get(serverId);



consoleManager.warn(
serverId,
"🛑 إيقاف السيرفر...\n"
);



if(data){

await this.stopProcessTree(
data.pid
);


this.processes.delete(serverId);

}



const pidFile =
path.join(
serverPath,
"server.pid"
);



if(await fs.pathExists(pidFile)){


try{

const pid =
parseInt(
await fs.readFile(pidFile,'utf8')
);


await this.stopProcessTree(pid);


}catch{}



}



await fs.remove(pidFile)
.catch(()=>{});



consoleManager.success(
serverId,
"✅ تم الإيقاف\n"
);



return {
success:true
};


}






async restart(server){


await this.stop(
server._id,
server.path
);


await new Promise(
r=>setTimeout(r,2000)
);


return this.start(server);


}






sendCommand(serverId,command){


const data =
this.processes.get(
serverId.toString()
);



const child =
data ? data.process : null;



if(child && child.stdin){


child.stdin.write(
command+"\n"
);


return true;

}



return false;


}






isRunning(serverId){

return this.processes.has(
serverId.toString()
);

}






async checkStatus(serverId,serverPath){



const data =
this.processes.get(
serverId.toString()
);



if(data){


try{

process.kill(
data.pid,
0
);


return "running";


}catch{}


}



const pidFile =
path.join(
serverPath,
"server.pid"
);



if(await fs.pathExists(pidFile)){


try{


const pid =
parseInt(
await fs.readFile(
pidFile,
'utf8'
)
);


process.kill(pid,0);


return "running";


}catch{}


}



return "stopped";


}
async checkResources(){

for(const [serverId,processData] of this.processes){


try{


const server =
await Server.findById(serverId);



if(!server) continue;



const stats =
await pidusage(
processData.pid
);



const cpu =
Math.round(stats.cpu);



const memory =
Math.round(
stats.memory / 1024 / 1024
);



let disk = 0;



const calculateSize = async(dir)=>{


if(!await fs.pathExists(dir))
return;



const files =
await fs.readdir(dir);



for(const file of files){


const full =
path.join(
dir,
file
);



const stat =
await fs.stat(full);



if(stat.isDirectory()){


await calculateSize(full);


}else{


disk += stat.size;


}



}



};



await calculateSize(
server.path
);



disk =
Math.round(
disk / 1024 / 1024
);

server.cpuUsage = cpu;

server.memoryUsage = memory;

server.diskUsage = disk;



await server.save();





if(this.io){


this.io
.to(
"server:"+serverId
)
.emit(
"resource-update",
{

id:serverId,

cpu,

memory,

disk,


ramPercent:
Math.round(
(memory / server.memoryLimit) * 100
),


diskPercent:
Math.round(
(disk / server.diskLimit) * 100
)


}

);


}





if(

cpu >= server.cpuLimit ||

memory >= server.memoryLimit ||

disk >= server.diskLimit

){



consoleManager.error(
serverId,
"⛔ تجاوز الموارد، جاري الإيقاف\n"
);



await this.stop(
serverId,
server.path
);



server.status =
"suspended";



await server.save();



if(this.io){


this.io
.to(
"server:"+serverId
)
.emit(
"resource-limit",
{
cpu,
memory,
disk
}
);


}



}



}catch(err){


console.log(
"Resource Error:",
err.message
);



}



}


}






async shutdown(){


for(const [serverId,data] of this.processes){


await this.stopProcessTree(
data.pid
);


}



this.processes.clear();


}


}




module.exports = {

processManager:
new ProcessManager(),

consoleManager

};