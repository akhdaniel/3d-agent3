kill $(lsof -t -nP -iTCP:28000 -sTCP:LISTEN)
nohup yarn dev > /tmp/backend.log 2>&1 &