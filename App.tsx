import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import tw from 'twrnc';

globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

// let localMediaStream;
// let remoteMediaStream;
let isVoiceOnly = false;

function App() {
  //
  const [caller, setCaller] = useState('');
  const [receiver, setReceiver] = useState('');
  const [statusText, setStatusText] = useState('disconnected');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    //
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302',
        },
      ],
    });

    const fetchStoredCaller = async () => {
      try {
        const storedCaller = await AsyncStorage.getItem('caller');
        if (storedCaller) {
          setCaller(storedCaller);
        }
      } catch (error) {
        console.error('Error:', error);
        ToastAndroid.show('Failed to fetch.', ToastAndroid.SHORT);
      }
    };

    const fetchStoredReceiver = async () => {
      try {
        const storedReceiver = await AsyncStorage.getItem('receiver');
        if (storedReceiver) {
          setReceiver(storedReceiver);
        }
      } catch (error) {
        console.error('Error:', error);
        ToastAndroid.show('Failed to fetch.', ToastAndroid.SHORT);
      }
    };

    fetchStoredCaller();
    fetchStoredReceiver();
    //
  }, []);

  const storeCaller = useCallback(async () => {
    try {
      if (caller.trim().length === 0) {
        ToastAndroid.show('Please enter caller.', ToastAndroid.SHORT);
        return;
      }
      await firestore().collection('pnumbers').doc(caller).set({
        number: caller,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      await AsyncStorage.setItem('caller', caller);
      ToastAndroid.show('Caller stored.', ToastAndroid.SHORT);
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to store caller.', ToastAndroid.SHORT);
    }
  }, [caller]);

  const storeReceiver = useCallback(async () => {
    try {
      if (receiver.trim().length === 0) {
        ToastAndroid.show('Please enter receiver.', ToastAndroid.SHORT);
        return;
      }
      await AsyncStorage.setItem('receiver', receiver);
      ToastAndroid.show('Receiver stored.', ToastAndroid.SHORT);
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to store receiver.', ToastAndroid.SHORT);
    }
  }, [receiver]);

  const createOffer = useCallback(async () => {
    try {
      if (caller.trim().length === 0) {
        ToastAndroid.show('Please enter caller.', ToastAndroid.SHORT);
        return;
      }
      const offerDescription = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: true,
      });
      await peerConnectionRef.current.setLocalDescription(offerDescription);
      await firestore().collection('pnumbers').doc(caller).set({
        number: caller,
        offer: offerDescription,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      ToastAndroid.show('Offer created.', ToastAndroid.SHORT);
      displayNotification('Offer created.');
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to create offer.', ToastAndroid.SHORT);
    }
  }, [caller]);

  const fetchAnswer = useCallback(async () => {
    try {
      const doc = await firestore().collection('pnumbers').doc(caller).get();
      const data = doc.data();
      if (!data || !data.answer) {
        ToastAndroid.show('Answer not found.', ToastAndroid.SHORT);
        return;
      }
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      ToastAndroid.show('Answer fetched.', ToastAndroid.SHORT);
      displayNotification('Answer fetched.');
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to set remote description.', ToastAndroid.SHORT);
    }
  }, [caller]);

  const fetchCandidates = useCallback(async () => {
    try {
      // const querySnapshot = await firestore()
      //   .collection('pnumbers')
      //   .doc(receiver)
      //   .collection('candidates')
      //   .get();
      const doc = await firestore().collection('pnumbers').doc(receiver).get();
      const data = doc.data();
      if (!data || !data.candidates) {
        ToastAndroid.show('Candidates not found.', ToastAndroid.SHORT);
        return;
      }
      const candidatesArray = data.candidates as Array<any>;
      for (const candidateData of candidatesArray) {
        const candidate = new RTCIceCandidate(candidateData);
        await peerConnectionRef.current.addIceCandidate(candidate);
        displayNotification('Candidate added: ' + candidate.candidate);
      }
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to fetch candidates.', ToastAndroid.SHORT);
    }
  }, [receiver]);

  const createAnswer = useCallback(async () => {
    try {
      if (receiver.trim().length === 0) {
        ToastAndroid.show('Please enter receiver.', ToastAndroid.SHORT);
        return;
      }
      const doc = await firestore().collection('pnumbers').doc(receiver).get();
      const data = doc.data();
      if (!data || !data.offer) {
        ToastAndroid.show('Offer not found.', ToastAndroid.SHORT);
        return;
      }
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answerDescription = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answerDescription);
      await firestore().collection('pnumbers').doc(receiver).update({
        answer: answerDescription,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      ToastAndroid.show('Answer created.', ToastAndroid.SHORT);
      displayNotification('Answer created.');
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to set remote description.', ToastAndroid.SHORT);
    }
  }, [receiver]);

  const setupMedia = useCallback(async () => {
    try {
      const mediaStream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          frameRate: 30,
          facingMode: 'user',
        },
      });
      if (isVoiceOnly) {
        let videoTrack = await mediaStream.getVideoTracks()[0];
        videoTrack.enabled = false;
      }
      localMediaStreamRef.current = mediaStream;
      // Add our stream to the peer connection.
      localMediaStreamRef.current
        .getTracks()
        .forEach(track => peerConnectionRef.current?.addTrack(track, localMediaStreamRef.current));
      ToastAndroid.show('Media stream obtained.', ToastAndroid.SHORT);
    } catch (err) {
      console.error('Error:', err);
      ToastAndroid.show('Failed to obtain media stream.', ToastAndroid.SHORT);
    }
  }, []);

  const storeCandidate = useCallback(
    async (candidate: RTCIceCandidate) => {
      try {
        if (caller.trim().length === 0) {
          return;
        }
        // await firestore().collection('pnumbers').doc(caller).collection('candidates').add({
        //   candidate,
        //   createdAt: firestore.FieldValue.serverTimestamp(),
        // });
        await firestore()
          .collection('pnumbers')
          .doc(caller)
          .update({
            candidates: firestore.FieldValue.arrayUnion(candidate),
          });
        displayNotification('ICE candidate stored.');
      } catch (err) {
        console.error('Error:', err);
        ToastAndroid.show('Failed to store candidate.', ToastAndroid.SHORT);
      }
    },
    [caller],
  );

  useEffect(() => {
    //

    function connectionstatechange(event) {
      switch (peerConnectionRef.current.connectionState) {
        case 'closed':
          // You can handle the call being disconnected here.
          displayNotification('Connection closed.');
          break;
      }
    }

    function icecandidate(event) {
      // When you find a null candidate then there are no more candidates.
      // Gathering of candidates has finished.
      if (!event.candidate) {
        return;
      }
      // Send the event.candidate onto the person you're calling.
      // Keeping to Trickle ICE Standards, you should send the candidates immediately.
      storeCandidate(event.candidate);
      displayNotification('New ICE candidate found.');
      setStatusText(prev => JSON.stringify(event.candidate) + '\n\n' + prev);
    }

    function icecandidateerror(event) {
      // You can ignore some candidate errors.
      // Connections can still be made even when errors occur.
      displayNotification(`ICE Candidate Error: ${event}`);
    }

    function iceconnectionstatechange(event) {
      switch (peerConnectionRef.current.iceConnectionState) {
        case 'connected':
        case 'completed':
          // You can handle the call being connected here.
          // Like setting the video streams to visible.
          displayNotification(
            'ICE Connection established.' + peerConnectionRef.current.iceConnectionState,
          );
          break;
      }
    }

    function negotiationneeded(event) {
      // You can start the offer stages here.
      // Be careful as this event can be called multiple times.
      displayNotification('Negotiation needed.');
    }

    function signalingstatechange(event) {
      switch (peerConnectionRef.current.signalingState) {
        case 'closed':
          // You can handle the call being disconnected here.
          ToastAndroid.show('Signaling state closed.', ToastAndroid.SHORT);
          displayNotification('Signaling state closed.');
          break;
      }
    }

    function track(event) {
      let stream = remoteStream;
      if (!stream) stream = new MediaStream();
      stream.addTrack(event.track);
      setRemoteStream(stream);
      displayNotification('Remote track added.');
    }

    peerConnectionRef.current.addEventListener('connectionstatechange', connectionstatechange);
    peerConnectionRef.current.addEventListener('icecandidate', icecandidate);
    peerConnectionRef.current.addEventListener('icecandidateerror', icecandidateerror);
    peerConnectionRef.current.addEventListener(
      'iceconnectionstatechange',
      iceconnectionstatechange,
    );
    peerConnectionRef.current.addEventListener('negotiationneeded', negotiationneeded);
    peerConnectionRef.current.addEventListener('signalingstatechange', signalingstatechange);
    peerConnectionRef.current.addEventListener('track', track);
    //
    return () => {
      console.log('Cleaning up peer connection event listeners.');
      peerConnectionRef.current.removeEventListener('connectionstatechange', connectionstatechange);
      peerConnectionRef.current.removeEventListener('icecandidate', icecandidate);
      peerConnectionRef.current.removeEventListener('icecandidateerror', icecandidateerror);
      peerConnectionRef.current.removeEventListener(
        'iceconnectionstatechange',
        iceconnectionstatechange,
      );
      peerConnectionRef.current.removeEventListener('negotiationneeded', negotiationneeded);
      peerConnectionRef.current.removeEventListener('signalingstatechange', signalingstatechange);
      peerConnectionRef.current.removeEventListener('track', track);
    };
  }, [remoteStream, storeCandidate]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={tw`flex-1`}>
        <ScrollView style={tw`flex-1 bg-white`}>
          <View style={tw`p-4 gap-4`}>
            <TouchableOpacity
              style={tw`p-4 bg-blue-500 rounded-lg`}
              onPress={() => displayNotification('Notification message')}
            >
              <Text style={tw`text-white text-center font-bold`}>displayNotification(0.1)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={tw`p-4 bg-blue-500 rounded-lg`} onPress={setupMedia}>
              <Text style={tw`text-white text-center font-bold`}>setupMedia(0.2)</Text>
            </TouchableOpacity>
            <View style={tw`flex-row gap-4`}>
              <RTCView
                streamURL={localMediaStreamRef.current?.toURL()}
                style={tw`flex-1 h-40 bg-blue-100`}
              />
              <RTCView streamURL={remoteStream?.toURL()} style={tw`flex-1 h-40 bg-purple-100`} />
            </View>
            <TextInput
              value={caller}
              onChangeText={text => setCaller(text)}
              style={tw`border border-blue-500 rounded-lg p-4 text-blue-500`}
              inputMode="numeric"
              placeholder="Caller"
              placeholderTextColor={'gray'}
            />
            <TouchableOpacity style={tw`p-4 bg-blue-500 rounded-lg`} onPress={storeCaller}>
              <Text style={tw`text-white text-center font-bold`}>storeCaller(0.3)</Text>
            </TouchableOpacity>
            <TextInput
              value={receiver}
              onChangeText={text => setReceiver(text)}
              style={tw`border border-blue-500 rounded-lg p-4 text-blue-500`}
              inputMode="numeric"
              placeholder="Receiver"
              placeholderTextColor={'gray'}
            />
            <TouchableOpacity style={tw`p-4 bg-blue-500 rounded-lg`} onPress={storeReceiver}>
              <Text style={tw`text-white text-center font-bold`}>storeReceiver(0.4)</Text>
            </TouchableOpacity>
            <View style={tw`h-1 bg-blue-100 rounded-xl`} />
            <TouchableOpacity style={tw`p-4 bg-blue-800 rounded-lg`} onPress={createOffer}>
              <Text style={tw`text-white text-center font-bold`}>createOffer(1)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={tw`p-4 bg-blue-800 rounded-lg`} onPress={fetchAnswer}>
              <Text style={tw`text-white text-center font-bold`}>fetchAnswer(4)</Text>
            </TouchableOpacity>
            <View style={tw`h-1 bg-blue-100 rounded-xl`} />
            <TouchableOpacity style={tw`p-4 bg-purple-800 rounded-lg`} onPress={createAnswer}>
              <Text style={tw`text-white text-center font-bold`}>createAnswer(2)</Text>
            </TouchableOpacity>
            <View style={tw`h-1 bg-blue-100 rounded-xl`} />
            <TouchableOpacity style={tw`p-4 bg-blue-500 rounded-lg`} onPress={fetchCandidates}>
              <Text style={tw`text-white text-center font-bold`}>fetchCandidates(3,5)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={tw`p-4 bg-blue-100 rounded-lg`}>
              <Text style={tw`text-blue-400`}>{statusText}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

async function displayNotification(message: string) {
  ToastAndroid.show(message, ToastAndroid.SHORT);
  await notifee.requestPermission();
  const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });
  await notifee.displayNotification({
    title: 'Talkie',
    body: message,
    android: {
      channelId,
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
    },
  });
}

export default App;
