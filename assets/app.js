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
    button.innerHTML = 'Conectando...';
    try {
      await connect(username);
      button.innerHTML = 'Sair';
      button.disabled = false;
    }
    catch {
      alert('Falha na conexão. Seria o backend?');
      button.innerHTML = 'Entrar';
      button.disabled = false;
    }
  }
  else {
    disconnect();
    button.innerHTML = 'Entrar';
    connected = false;
  }
};

const connect = async (username) => {
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
    count.innerHTML = 'Desconectado';
  }
  else {
    count.innerHTML = (room.participants.size + 1) + ' participantes online.';
  }
};

const negotiate = () => {
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
    console.log(offer);
    return fetch('http://localhost:2700/offer', {
      body: JSON.stringify({
        "sdp": offer.sdp,
        "type": offer.type,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      mode: 'no-cors'
    });
  }).then(function (response) {
    console.log('>>>>>>>> response');
    console.log(response.json());
    return response.json();
  }).then(function (answer) {
    console.log('>>>>>>>> pc.setRemoteDescription(answer)');
    console.log(pc.setRemoteDescription(answer));
    return pc.setRemoteDescription(answer);
  }).catch(function (e) {
    console.log(e);
  });
}

const participantConnected = (participant) => {
  const participantDiv = document.createElement('div');
  participantDiv.setAttribute('id', participant.sid);
  participantDiv.setAttribute('class', 'participant');

  const tracksDiv = document.createElement('div');
  participantDiv.appendChild(tracksDiv);

  const labelDiv = document.createElement('div');
  labelDiv.innerHTML = participant.identity;
  participantDiv.appendChild(labelDiv);

  container.appendChild(participantDiv);

  console.log('>>>>>>>> Participante conectado');

  var config = {
    sdpSemantics: 'unified-plan'
  };
  pc = new RTCPeerConnection(config);
  dc = pc.createDataChannel('result');

  console.log('>>>>>>>> Canal criado');

  dc.onopen = async () => {
    console.log('>>>>>>>> Opened data channel');
  };
  dc.onclose = async () => {
    clearInterval(dcInterval);
    console.log('>>>>>>>> Closed data channel');
  };
  dc.onmessage = async (messageEvent) => {
    console.log('>>>>>>>> Data channel on message');
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
      // performRecvText(voskResult.text);
    } else if ((voskResult.partial?.length || 0) > 0) {
      // performRecvPartial(voskResult.partial);
    }
  };
  pc.oniceconnectionstatechange = async () => {
    console.log('>>>>>>>> Peer connection disconnected');
    if (pc.iceConnectionState == 'disconnected') {
      console.log('>>>>>>>> Disconnected');
    }
  }

  var constraints = {
    audio: true,
    video: false,
  };

  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    stream.getTracks().forEach(function (track) {
      console.log(`>>>>>>>>>>>> Stream (${participant.identity}) >>>>>>>>>>>>>>`);
      pc.addTrack(track, stream);
    });
    return negotiate();
  }, function (err) {
    console.log('>>>>>>>> Could not acquire media: ' + err);
  });

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
  button.innerHTML = 'Entrar';
  connected = false;
  updateParticipantCount();
};

addLocalVideo();
button.addEventListener('click', connectButtonHandler);

