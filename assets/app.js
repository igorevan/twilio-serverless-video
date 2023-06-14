const usernameInput = document.getElementById('username');
const button = document.getElementById('join_leave');
const container = document.getElementById('container');
const count = document.getElementById('count');
let connected = false;
let room;

// peer connection
var pc = null;
var dc = null, dcInterval = null;

const addLocalVideo = async () => {
  const track = await Twilio.Video.createLocalVideoTrack();
  const video = document.getElementById('local').firstElementChild;
  video.appendChild(track.attach());
};

const connectButtonHandler = async (event) => {
  event.preventDefault();
  if (!connected) {
    const username = usernameInput.value;
    if (!username) {
      alert('Enter your name before connecting');
      return;
    }
    button.disabled = true;
    button.innerHTML = 'Connecting...';
    try {
      await connect(username);
      button.innerHTML = 'Leave call';
      button.disabled = false;
    }
    catch {
      alert('Connection failed. Is the backend running?');
      button.innerHTML = 'Join call';
      button.disabled = false;
    }
  }
  else {
    disconnect();
    button.innerHTML = 'Join call';
    connected = false;
  }
};

const connect = async (username) => {
  console.log(`>>> Usuário local: ${username}`);

  const response = await fetch('/get_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'username': username }),
  });
  const data = await response.json();
  room = await Twilio.Video.connect(data.token);
  room.participants.forEach(participantConnected);
  room.on('participantConnected', participantConnected);
  room.on('participantDisconnected', participantDisconnected);
  connected = true;
  updateParticipantCount();
};

const updateParticipantCount = () => {
  if (!connected) {
    count.innerHTML = 'Disconnected.';
  }
  else {
    count.innerHTML = (room.participants.size + 1) + ' participants online.';
  }
};

function negotiate() {
  console.log('>>> Entrou no negotiate()');

  return pc.createOffer().then(function (offer) {
    return pc.setLocalDescription(offer);
  }).then(function () {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        function checkState() {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        }

        pc.addEventListener('icegatheringstatechange', checkState);
      }
    });
  }).then(function () {
    var offer = pc.localDescription;
    // return fetch('http://localhost:2700/offer', {
    return fetch('https://e476-2804-14d-bac1-46c4-3f6d-1538-ed02-f7a2.ngrok-free.app', {
      body: JSON.stringify({
        sdp: offer.sdp,
        type: offer.type,
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });
  }).then(function (response) {
    return response.json();
  }).then(function (answer) {
    return pc.setRemoteDescription(answer);
  }).catch(function (e) {
    console.log(e);
  });
}

function performRecvText(str) {
  htmlStr = document.getElementById('text').innerHTML;
  htmlStr += '<div>' + str + '</div>\n';
  document.getElementById('text').innerHTML = htmlStr;
  document.getElementById('partial').innerText = ' > ';
}

function performRecvPartial(str) {
  document.getElementById('partial').innerText = ' > ' + str;
}

const participantConnected = (participant) => {
  console.log(`>>> Participante ${participant.identity} entrou na sala`);

  const user = usernameInput.value;

  pc = new RTCPeerConnection({ sdpSemantics: 'unified-plan' });

  dc = pc.createDataChannel('result');
  dc.onclose = function () {
    clearInterval(dcInterval);
    console.log('>>> Canal fechado');
  };
  dc.onopen = function () {
    console.log('>>> Canal aberto');
    dc.send(user);
  };
  dc.onmessage = function (messageEvent) {
    console.log('>>> Canal recebendo mensagem');
    // console.log(JSON.parse(messageEvent.data));

    if (!messageEvent.data) {
      return;
    }

    let voskResult;
    try {
      voskResult = JSON.parse(messageEvent.data);
    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      return;
    }
    if ((voskResult.text?.length || 0) > 0) {
      performRecvText(voskResult.text);
    } else if ((voskResult.partial?.length || 0) > 0) {
      performRecvPartial(voskResult.partial);
    }
  };

  pc.oniceconnectionstatechange = function () {
    if (pc.iceConnectionState == 'disconnected') {
      console.log('>>> Disconnected <<<');
    }
  }

  navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
    stream.getTracks().forEach(function (track) {
      console.log('>>> Enviando stream de áudio');
      pc.addTrack(track, stream);
    });
    return negotiate();
  }, function (err) {
    console.log('>>> Não foi possível adquirir a mídia: ' + err);
  });

  const participantDiv = document.createElement('div');
  participantDiv.setAttribute('id', participant.sid);
  participantDiv.setAttribute('class', 'participant');

  const tracksDiv = document.createElement('div');
  participantDiv.appendChild(tracksDiv);

  const labelDiv = document.createElement('div');
  labelDiv.innerHTML = participant.identity;
  participantDiv.appendChild(labelDiv);

  container.appendChild(participantDiv);

  participant.tracks.forEach(publication => {
    if (publication.isSubscribed) {
      trackSubscribed(tracksDiv, publication.track);
    }
  });
  participant.on('trackSubscribed', track => trackSubscribed(tracksDiv, track));
  participant.on('trackUnsubscribed', trackUnsubscribed);
  updateParticipantCount();
};

const participantDisconnected = (participant) => {
  // close data channel
  if (dc) {
    dc.close();
  }

  // close transceivers
  if (pc.getTransceivers) {
    pc.getTransceivers().forEach(function (transceiver) {
      if (transceiver.stop) {
        transceiver.stop();
      }
    });
  }

  // close local audio / video
  pc.getSenders().forEach(function (sender) {
    sender.track.stop();
  });

  // close peer connection
  setTimeout(function () {
    pc.close();
  }, 500);

  document.getElementById(participant.sid).remove();
  updateParticipantCount();
};

const trackSubscribed = (div, track) => {
  div.appendChild(track.attach());
};

const trackUnsubscribed = (track) => {
  track.detach().forEach(element => element.remove());
};

const disconnect = () => {
  room.disconnect();
  while (container.lastChild.id != 'local') {
    container.removeChild(container.lastChild);
  }
  button.innerHTML = 'Join call';
  connected = false;
  updateParticipantCount();
};

addLocalVideo();
button.addEventListener('click', connectButtonHandler);
